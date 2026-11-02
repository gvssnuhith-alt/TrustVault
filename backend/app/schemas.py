from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models import UserRole, AuditAction

# User schemas
class UserCreate(BaseModel):
    email: EmailStr
    username: str
    password: str
    role: UserRole = UserRole.VIEWER

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

# Permission schemas
class PermissionGrantRequest(BaseModel):
    grantee_email: str
    can_read: bool = True
    can_edit: bool = False

class PermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    document_id: str
    grantee_id: str
    grantee_username: str
    grantee_email: str
    can_read: bool
    can_edit: bool
    is_active: bool
    created_at: datetime

# Document schemas
class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    original_filename: str
    category: str
    mime_type: str
    file_size: int
    file_hash_sha256: str
    owner_id: str
    owner_username: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    permissions: List[PermissionResponse] = []

class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None

# Audit schemas
class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    uuid_str: str
    timestamp: datetime
    user_id: Optional[str] = None
    document_id: Optional[str] = None
    action: AuditAction
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata_json: str
    previous_hash: str
    current_hash: str
