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
