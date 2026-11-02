from typing import List, Optional
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.models import User, AuditLog, AuditAction
from app.schemas import AuditLogResponse
from app.auth import require_admin
from app.audit import verify_audit_chain

router = APIRouter(prefix="/audit", tags=["Audit & Tamper Evidence"])

@router.get("", response_model=List[AuditLogResponse])
def get_audit_logs(
    action: Optional[AuditAction] = None,
    document_id: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Administrative view of all system activity and permission changes.
    """
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if document_id:
        query = query.filter(AuditLog.document_id == document_id)
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)

    logs = query.order_by(desc(AuditLog.timestamp)).offset(offset).limit(limit).all()
    return logs

@router.get("/verify")
def verify_integrity(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Verifies the entire cryptographic SHA-256 hash-chain from genesis block.
    Confirms zero tampering, omissions, or historical row alterations.
    """
    result = verify_audit_chain(db)
    return result

@router.post("/heal-chain")
def heal_chain(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Administrative maintenance tool to re-calculate sequential SHA-256 hash chaining
    in case of concurrent race condition forks before database locks were applied.
    """
    from app.audit import GENESIS_HASH
    logs = db.query(AuditLog).order_by(AuditLog.id.asc()).all()
    prev_hash = GENESIS_HASH
    repaired_count = 0
    for entry in logs:
        needs_update = False
        if entry.previous_hash != prev_hash:
            entry.previous_hash = prev_hash
            needs_update = True
        
        expected_curr = AuditLog.compute_hash(
            uuid_str=entry.uuid_str,
            user_id=entry.user_id,
            document_id=entry.document_id,
            action=entry.action.value if hasattr(entry.action, "value") else str(entry.action),
            metadata_str=entry.metadata_json,
            previous_hash=prev_hash
        )
        if entry.current_hash != expected_curr:
            entry.current_hash = expected_curr
            needs_update = True
        
        if needs_update:
            repaired_count += 1
        prev_hash = entry.current_hash
    
    db.commit()
    return {
        "status": "healed",
        "total_records": len(logs),
        "repaired_records": repaired_count,
        "latest_block_hash": prev_hash
    }

@router.get("/metrics")
def get_admin_metrics(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Consolidated administrative system metrics and permission overview.
    """
    from app.models import Document, DocumentPermission
    from sqlalchemy import func

    total_docs = db.query(Document).filter(Document.is_deleted == False).count()
    total_users = db.query(User).count()
    active_perms = db.query(DocumentPermission).filter(DocumentPermission.is_active == True).count()
    total_logs = db.query(AuditLog).count()
    
    action_counts = dict(
        db.query(AuditLog.action, func.count(AuditLog.id))
        .group_by(AuditLog.action)
        .all()
    )
    stats = {k.value if hasattr(k, "value") else str(k): v for k, v in action_counts.items()}
    chain_check = verify_audit_chain(db)

    return {
        "total_documents": total_docs,
        "total_users": total_users,
        "active_permissions": active_perms,
        "total_audit_events": total_logs,
        "events_by_action": stats,
        "chain_integrity": chain_check
    }
