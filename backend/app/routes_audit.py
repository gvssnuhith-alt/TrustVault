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

    logs = query.order_by(desc(AuditLog.timestamp)).limit(limit).all()
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
