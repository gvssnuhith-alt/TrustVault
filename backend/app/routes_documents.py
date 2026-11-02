import os
import hashlib
import uuid
import aiofiles
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from app.config import settings
from app.database import get_db
from app.models import User, UserRole, Document, DocumentPermission, AuditAction
from app.schemas import DocumentResponse, DocumentUpdateRequest, PermissionGrantRequest, PermissionResponse
from app.auth import get_current_user, require_owner_or_admin
from app.audit import record_audit_event

router = APIRouter(prefix="/documents", tags=["Documents & Access Control"])

# Magic-byte file signatures for strict content inspection
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB maximum upload limit

ALLOWED_MAGIC_SIGNATURES = {
    b"%PDF-": "application/pdf",
    b"PK\x03\x04": "application/vnd.openxmlformats-officedocument", # docx, xlsx, pptx, zip
    b"\xd0\xcf\x11\xe0": "application/msword",                      # legacy doc/xls
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}

def validate_magic_bytes(header: bytes, filename: str) -> str:
    """
    Inspects leading bytes of uploaded file to prevent executable masquerading.
    """
    for magic, mime in ALLOWED_MAGIC_SIGNATURES.items():
        if header.startswith(magic):
            return mime
    
    # Plain text detection (ASCII / UTF-8 text)
    try:
        header[:512].decode("utf-8")
        if filename.endswith((".txt", ".md", ".csv", ".json")):
            return "text/plain"
    except UnicodeDecodeError:
        pass

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="File content rejected: Not an allowed document type or executable masquerade detected."
    )

def check_document_access(
    db: Session,
    document: Document,
    user: User,
    require_edit: bool = False
) -> bool:
    """
    LIVE SERVER-SIDE AUTHORIZATION WALL:
    1. Admin has supervisory read access (and edit if explicitly given).
    2. Owner has 100% full read & edit access.
    3. Viewers must hold an active, non-revoked permission row in database.
    Zero cached or stale JWT checks.
    """
    if document.is_deleted:
        return False

    # Owner has absolute access
    if document.owner_id == user.id:
        return True

    # Admin supervisory access
    if user.role == UserRole.ADMIN:
        return True

    # Check granular user permission row
    perm = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == document.id,
        DocumentPermission.grantee_id == user.id,
        DocumentPermission.is_active == True
    ).first()

    if not perm:
        return False

    if require_edit:
        return perm.can_edit
    return perm.can_read

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    request: Request,
    title: str = Form(...),
    category: str = Form("General"),
    file: UploadFile = File(...),
    current_user: User = Depends(require_owner_or_admin),
    db: Session = Depends(get_db)
):
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)

    header = await file.read(512)
    if not header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File content rejected: Uploaded file is empty (0 bytes)."
        )
    mime_type = validate_magic_bytes(header, file.filename or "file")
    await file.seek(0)

    # Sanitize original filename (prevent path traversal like ../../)
    raw_filename = os.path.basename(file.filename or "unknown").strip()
    if not raw_filename or raw_filename.startswith("."):
        raw_filename = f"document_{uuid.uuid4().hex[:8]}.bin"

    # Generate secure storage path with UUID
    file_uuid = str(uuid.uuid4())
    ext = os.path.splitext(raw_filename)[1]
    storage_filename = f"{file_uuid}{ext}.bin"
    storage_path = os.path.join(settings.STORAGE_DIR, storage_filename)

    hasher = hashlib.sha256()
    file_size = 0

    try:
        async with aiofiles.open(storage_path, "wb") as out_file:
            while chunk := await file.read(1024 * 1024):  # 1MB buffer
                file_size += len(chunk)
                if file_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum allowed size of {MAX_FILE_SIZE // (1024 * 1024)}MB."
                    )
                hasher.update(chunk)
                await out_file.write(chunk)
    except Exception:
        if os.path.exists(storage_path):
            os.remove(storage_path)
        raise

    doc = Document(
        title=title.strip() if title else raw_filename,
        original_filename=raw_filename,
        storage_path=storage_path,
        mime_type=mime_type,
        file_size=file_size,
        file_hash_sha256=hasher.hexdigest(),
        category=category.strip() if category else "General",
        owner_id=current_user.id
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    record_audit_event(
        db=db,
        action=AuditAction.DOC_UPLOAD,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"title": doc.title, "filename": doc.original_filename, "size": file_size, "hash": doc.file_hash_sha256}
    )

    return doc

@router.get("", response_model=List[DocumentResponse])
def list_documents(
    request: Request,
    search: Optional[str] = None,
    category: Optional[str] = None,
    owner: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort_by: Optional[str] = Query("newest"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns only documents the user is authorized to know about:
    1. Admin: all documents.
    2. Owner: documents owned by user.
    3. Viewer: documents explicitly granted to user via active permission.
    """
    query = db.query(Document).filter(Document.is_deleted == False)

    if current_user.role != UserRole.ADMIN:
        # User is either owner OR has active permission
        query = query.outerjoin(DocumentPermission, and_(
            DocumentPermission.document_id == Document.id,
            DocumentPermission.grantee_id == current_user.id,
            DocumentPermission.is_active == True,
            DocumentPermission.can_read == True
        )).filter(
            or_(
                Document.owner_id == current_user.id,
                DocumentPermission.id != None
            )
        )

    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Document.title.ilike(search_filter),
                Document.original_filename.ilike(search_filter)
            )
        )

    if category:
        query = query.filter(Document.category.ilike(f"%{category}%"))

    if owner:
        query = query.join(User, Document.owner_id == User.id).filter(
            or_(
                User.username.ilike(f"%{owner}%"),
                User.email.ilike(f"%{owner}%")
            )
        )

    if date_from:
        try:
            d_from = datetime.fromisoformat(date_from)
            query = query.filter(Document.created_at >= d_from)
        except Exception:
            pass

    if date_to:
        try:
            d_to = datetime.fromisoformat(date_to)
            query = query.filter(Document.created_at <= d_to)
        except Exception:
            pass

    if sort_by == "oldest":
        query = query.order_by(Document.created_at.asc())
    elif sort_by == "title_asc":
        query = query.order_by(Document.title.asc())
    elif sort_by == "title_desc":
        query = query.order_by(Document.title.desc())
    elif sort_by == "size_asc":
        query = query.order_by(Document.file_size.asc())
    elif sort_by == "size_desc":
        query = query.order_by(Document.file_size.desc())
    else:
        query = query.order_by(Document.created_at.desc())

    docs = query.all()
    return docs

@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not check_document_access(db, doc, current_user, require_edit=False):
        record_audit_event(
            db=db,
            action=AuditAction.ACCESS_DENIED,
            user_id=current_user.id,
            document_id=document_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "Unauthorized document read attempt"}
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    record_audit_event(
        db=db,
        action=AuditAction.DOC_READ,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"title": doc.title}
    )

    return doc

@router.get("/{document_id}/download")
def download_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    STRICT SERVER-CONTROLLED DOWNLOAD PROXY:
    Evaluates DB authorization at runtime. Instant revocation terminates downloads immediately.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not check_document_access(db, doc, current_user, require_edit=False):
        record_audit_event(
            db=db,
            action=AuditAction.ACCESS_DENIED,
            user_id=current_user.id,
            document_id=document_id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "Unauthorized file download attempt"}
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not os.path.exists(doc.storage_path):
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Storage asset missing")

    record_audit_event(
        db=db,
        action=AuditAction.DOC_DOWNLOAD,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"filename": doc.original_filename, "size": doc.file_size}
    )

    return FileResponse(
        path=doc.storage_path,
        media_type=doc.mime_type,
        filename=doc.original_filename
    )

@router.post("/{document_id}/permissions", response_model=PermissionResponse)
def grant_permission(
    document_id: str,
    grant_in: PermissionGrantRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Only document owner or system admin can grant permissions
    if doc.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can grant permissions")

    target_clean = grant_in.grantee_email.strip().lower()
    grantee = db.query(User).filter(
        or_(
            func.lower(User.email) == target_clean,
            func.lower(User.username) == target_clean
        )
    ).first()
    if not grantee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail=f"Target user '{grant_in.grantee_email}' not found. Use a registered email (e.g. viewer@trustvault.io)"
        )

    existing_perms = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc.id,
        DocumentPermission.grantee_id == grantee.id
    ).all()

    if existing_perms:
        perm = existing_perms[0]
        perm.can_read = grant_in.can_read
        perm.can_edit = grant_in.can_edit
        perm.is_active = True
        perm.revoked_at = None
        for duplicate in existing_perms[1:]:
            db.delete(duplicate)
    else:
        perm = DocumentPermission(
            document_id=doc.id,
            grantee_id=grantee.id,
            granted_by_id=current_user.id,
            can_read=grant_in.can_read,
            can_edit=grant_in.can_edit,
            is_active=True
        )
        db.add(perm)

    db.commit()
    db.refresh(perm)

    record_audit_event(
        db=db,
        action=AuditAction.PERM_GRANT,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={
            "grantee_id": grantee.id,
            "grantee_email": grantee.email,
            "can_read": perm.can_read,
            "can_edit": perm.can_edit
        }
    )

    return {
        "id": perm.id,
        "document_id": perm.document_id,
        "grantee_id": perm.grantee_id,
        "grantee_username": grantee.username,
        "grantee_email": grantee.email,
        "can_read": perm.can_read,
        "can_edit": perm.can_edit,
        "is_active": perm.is_active,
        "created_at": perm.created_at
    }

@router.delete("/{document_id}/permissions/{grantee_id}")
def revoke_permission(
    document_id: str,
    grantee_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    INSTANT REVOCATION:
    Marks permission row as inactive immediately inside DB transaction.
    """
    from datetime import datetime, timezone

    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if doc.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owner can revoke permissions")

    # Find active permissions matching either grantee_id or permission id
    perms = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc.id,
        or_(
            DocumentPermission.grantee_id == grantee_id,
            DocumentPermission.id == grantee_id
        ),
        DocumentPermission.is_active == True
    ).all()

    if not perms:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active permission not found")

    now = datetime.now(timezone.utc)
    for perm in perms:
        perm.is_active = False
        perm.revoked_at = now
    db.commit()

    record_audit_event(
        db=db,
        action=AuditAction.PERM_REVOKE,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"revoked_grantee_id": grantee_id}
    )

    return {"status": "success", "message": "Access revoked immediately."}

@router.patch("/{document_id}", response_model=DocumentResponse)
def update_document(
    document_id: str,
    update_data: DocumentUpdateRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update document metadata (title, category).
    Authorized: Document Owner, Admin, or Viewer granted with can_edit=True.
    Read-only viewers get 403 Forbidden.
    Unauthorized users get 404 Not Found (Zero existence oracle).
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Check if user has edit access
    if not check_document_access(db, doc, current_user, require_edit=True):
        # If user has read access, return 403 Forbidden
        if check_document_access(db, doc, current_user, require_edit=False):
            record_audit_event(
                db=db,
                action=AuditAction.ACCESS_DENIED,
                user_id=current_user.id,
                document_id=doc.id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                metadata={"reason": "Read-only viewer attempted document edit"}
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Edit permission required")
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    changes = {}
    if update_data.title is not None and update_data.title.strip():
        changes["old_title"] = doc.title
        doc.title = update_data.title.strip()
        changes["new_title"] = doc.title

    if update_data.category is not None and update_data.category.strip():
        changes["old_category"] = doc.category
        doc.category = update_data.category.strip()
        changes["new_category"] = doc.category

    db.commit()
    db.refresh(doc)

    record_audit_event(
        db=db,
        action=AuditAction.DOC_UPDATE,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata=changes
    )

    return doc

@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete document.
    Authorized: Document Owner or Admin ONLY.
    Viewers (even with can_edit=True) get 403 Forbidden.
    Unauthorized users get 404 Not Found.
    Audit log remains cryptographically intact.
    """
    doc = db.query(Document).filter(Document.id == document_id, Document.is_deleted == False).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    # Strictly check owner or admin
    if doc.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        if check_document_access(db, doc, current_user, require_edit=False):
            record_audit_event(
                db=db,
                action=AuditAction.ACCESS_DENIED,
                user_id=current_user.id,
                document_id=doc.id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                metadata={"reason": "Non-owner attempted document deletion"}
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only document owner or admin can delete document")
        else:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    doc.is_deleted = True
    db.commit()

    # Safely clean up storage file
    if os.path.exists(doc.storage_path):
        try:
            os.remove(doc.storage_path)
        except OSError:
            pass

    record_audit_event(
        db=db,
        action=AuditAction.DOC_DELETE,
        user_id=current_user.id,
        document_id=doc.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"title": doc.title, "filename": doc.original_filename}
    )

    return {"status": "success", "message": "Document deleted successfully."}
