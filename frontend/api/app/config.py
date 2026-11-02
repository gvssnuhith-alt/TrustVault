import os
from pydantic_settings import BaseSettings
from pydantic import ConfigDict

class Settings(BaseSettings):
    model_config = ConfigDict(case_sensitive=True)

    PROJECT_NAME: str = "TrustVault"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "TRUSTVAULT_SUPER_SECRET_PRODUCTION_KEY_SNOVASYS_2026_99887766")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Database: Default to sqlite for fast zero-cost local testing / self-contained tests,
    # or Postgres if DATABASE_URL is set in environment (e.g. Render / Supabase)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./trustvault.db")
    
    # Storage path & Provider
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")  # "local" or "s3"
    STORAGE_DIR: str = os.getenv(
        "STORAGE_DIR",
        "/tmp/storage" if (os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME")) else "./storage"
    )
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET_NAME", "")
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "")
    S3_ACCESS_KEY_ID: str = os.getenv("S3_ACCESS_KEY_ID", "")
    S3_SECRET_ACCESS_KEY: str = os.getenv("S3_SECRET_ACCESS_KEY", "")
    S3_REGION_NAME: str = os.getenv("S3_REGION_NAME", "auto")

    # Production lifecycle and initial admin
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    INITIAL_ADMIN_PASSWORD: str = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    ALLOW_DEMO_SEED: bool = os.getenv("ALLOW_DEMO_SEED", "true").lower() in ("true", "1", "yes")
    ALLOW_EPHEMERAL_STORAGE: bool = os.getenv("ALLOW_EPHEMERAL_STORAGE", "false").lower() in ("true", "1", "yes")

settings = Settings()
