"""Application configuration from environment variables."""
import os
from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment."""

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/db/app.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        """Normalize DATABASE_URL for async drivers and env interpolation."""
        if not value:
            return value
        url = os.path.expandvars(str(value))
        if url.startswith("postgres://"):
            return "postgresql+asyncpg://" + url[len("postgres://"):]
        if url.startswith("postgresql://") and "+asyncpg" not in url:
            return "postgresql+asyncpg://" + url[len("postgresql://"):]
        return url

    # OpenAI
    openai_api_key: str = ""
    gpt_model: str = "gpt-4o"
    gpt_reasoning_model: str = "o1-mini"
    gpt_creative_model: str = "gpt-4o"

    # GMI Cloud (OpenAI-compatible API)
    gmi_api_key: str = ""
    gmi_base_url: str = "https://api.gmi-serving.com/v1"
    gmi_model: str = "google/gemini-3-pro-preview"
    gmi_creative_model: str = "deepseek-ai/DeepSeek-V3-0324"
    gmi_vision_model: str = "google/gemini-3-pro-preview"
    gmi_video_model: str = "ltx-2-pro-image-to-video"

    # Seedream (Image Generation)
    seedream_api_key: str = ""
    seedream_server_url: str = "https://ark.ap-southeast.bytepluses.com/api/v3"
    seedream_generate_path: str = "/images/generations"
    seedream_reference_path: str = ""
    seedream_model: str = "seedream-4-5-251128"
    seedream_auth_header: str = "Authorization"
    seedream_auth_scheme: str = "Bearer"
    seedream_watermark: bool = False

    # Parrot (Video Generation)
    parrot_api_key: str = ""
    parrot_api_url: str = "https://parrot.pika.art/api/v1/generate/v0"

    # Pika Addition API (Reference Video Generation)
    pika_addition_api_key: str = ""
    pika_addition_api_url: str = "https://parrot.pika.art/api/v1/generate"

    # Twitter OAuth 1.0a (legacy)
    twitter_api_key: str = ""
    twitter_api_secret: str = ""
    twitter_access_token: str = ""
    twitter_access_token_secret: str = ""
    # Twitter OAuth 2.0
    twitter_client_id: str = ""
    twitter_client_secret: str = ""

    # Storage
    public_base_url: str = "http://localhost:8000"
    upload_dir: str = "public/uploads"

    # Cloud Storage (Google Cloud Storage)
    # Set storage_backend to "gcs" to use Google Cloud Storage, or "database" for DB storage
    storage_backend: str = "database"  # "database" or "gcs"
    gcs_bucket_name: str = ""
    gcs_project_id: str = ""
    # For local dev, set GOOGLE_APPLICATION_CREDENTIALS env var to service account JSON path
    # For Railway/Cloud Run, credentials are auto-detected

    # CORS
    cors_origins: str = "*"

    # Logging
    log_level: str = "INFO"

    # JWT Authentication
    jwt_secret_key: str = "your-super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
