import os
import hashlib
import uuid
import aiofiles
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.config import settings
from app.database import get_db
from app.models import User, UserRole, Document, DocumentPermission, AuditAction
from app.schemas import DocumentResponse, DocumentUpdateRequest, PermissionGrantRequest, PermissionResponse
from app.auth import get_current_user, require_owner_or_admin
from app.audit import record_audit_event

router = APIRouter(prefix="/documents", tags=["Documents & Access Control"])

# Magic-byte file signatures for strict content inspection
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

    # Admin read access
    if user.role == UserRole.ADMIN and not require_edit:
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
    mime_type = validate_magic_bytes(header, file.filename or "file")
    await file.seek(0)

    # Generate secure storage path with UUID
    file_uuid = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "")[1]
    storage_filename = f"{file_uuid}{ext}.bin"
    storage_path = os.path.join(settings.STORAGE_DIR, storage_filename)

    hasher = hashlib.sha256()
    file_size = 0

    async with aiofiles.open(storage_path, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):  # 1MB buffer
            hasher.update(chunk)
            file_size += len(chunk)
            await out_file.write(chunk)

    doc = Document(
        title=title,
        original_filename=file.filename or "unknown",
        storage_path=storage_path,
        mime_type=mime_type,
        file_size=file_size,
        file_hash_sha256=hasher.hexdigest(),
        category=category,
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

    docs = query.order_by(Document.created_at.desc()).all()
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

    grantee = db.query(User).filter(User.email == grant_in.grantee_email).first()
    if not grantee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

    perm = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc.id,
        DocumentPermission.grantee_id == grantee.id
    ).first()

    if perm:
        perm.can_read = grant_in.can_read
        perm.can_edit = grant_in.can_edit
        perm.is_active = True
        perm.revoked_at = None
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

    perm = db.query(DocumentPermission).filter(
        DocumentPermission.document_id == doc.id,
        DocumentPermission.grantee_id == grantee_id
    ).first()

    if not perm or not perm.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active permission not found")

    perm.is_active = False
    perm.revoked_at = datetime.now(timezone.utc)
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
