import os
from fastapi import FastAPI, Depends, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.config import settings
from app.database import engine, Base, get_db
from app.routes_auth import router as auth_router
from app.routes_documents import router as docs_router
from app.routes_audit import router as audit_router

# Create database tables automatically in local dev only; bypass in serverless to prevent cold-start DDL contention
if not os.getenv("VERCEL") and not os.getenv("SERVERLESS") and not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database schema initialization warning: {e}")
elif os.getenv("INIT_DB", "false").lower() in ("true", "1"):
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"Database schema initialization warning: {e}")

# Ensure storage directory exists
try:
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
except Exception:
    pass

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="TrustVault - Secure document sharing platform with cryptographic tamper-evident audit trail"
)

# CORS configuration for React frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(docs_router, prefix=settings.API_V1_STR)
app.include_router(audit_router, prefix=settings.API_V1_STR)

@app.get("/")
def health_check_root():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "security_policy": "Zero-Trust live DB evaluation with SHA-256 chained audit"
    }

@app.get("/healthz")
@app.get("/api/healthz")
def health_check_healthz():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

@app.get("/readyz")
@app.get("/api/readyz")
def readiness_check(response: Response, db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "service": settings.PROJECT_NAME,
            "database": "connected"
        }
    except Exception as e:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "status": "not_ready",
            "service": settings.PROJECT_NAME,
            "database": "disconnected",
            "error": str(e)
        }
