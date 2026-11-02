from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, UserRole, AuditAction
from app.schemas import UserCreate, UserResponse, TokenResponse, LoginRequest
from app.auth import get_password_hash, verify_password, create_access_token, get_current_user
from app.audit import record_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, request: Request, db: Session = Depends(get_db)):
    # Check if email or username exists
    existing = db.query(User).filter(
        (User.email == user_in.email) | (User.username == user_in.username)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username already registered"
        )

    user = User(
        email=user_in.email,
        username=user_in.username,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    record_audit_event(
        db=db,
        action=AuditAction.USER_REGISTER,
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"email": user.email, "role": user.role.value}
    )

    return user

@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(
        (User.email == login_data.username_or_email) | (User.username == login_data.username_or_email)
    ).first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        record_audit_event(
            db=db,
            action=AuditAction.ACCESS_DENIED,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            metadata={"reason": "Invalid credentials", "identifier": login_data.username_or_email}
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )

    access_token = create_access_token(data={"sub": user.id, "role": user.role.value})

    record_audit_event(
        db=db,
        action=AuditAction.USER_LOGIN,
        user_id=user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"role": user.role.value}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    import hashlib
    from app.models import RevokedToken

    # Extract raw bearer token from Authorization header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        raw_token = auth_header.split(" ", 1)[1].strip()
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        
        # Store in revocation table if not already present
        if not db.query(RevokedToken).filter(RevokedToken.token_hash == token_hash).first():
            revoked_entry = RevokedToken(token_hash=token_hash)
            db.add(revoked_entry)
            db.commit()

    record_audit_event(
        db=db,
        action=AuditAction.USER_LOGOUT,
        user_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        metadata={"email": current_user.email, "role": current_user.role.value}
    )
    return {"status": "success", "message": "Successfully logged out and session revoked."}
