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
    
    # Storage path
    STORAGE_DIR: str = os.getenv("STORAGE_DIR", "./storage")

settings = Settings()
