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

    # Storage
    public_base_url: str = "http://localhost:8000"
    upload_dir: str = "public/uploads"

    # CORS
    cors_origins: str = "*"

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
