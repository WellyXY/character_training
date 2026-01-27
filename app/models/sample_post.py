"""SamplePost model for Sample Gallery."""
import uuid
from datetime import datetime
from typing import Optional
import enum

from sqlalchemy import String, Text, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MediaType(str, enum.Enum):
    """Media type enum."""
    IMAGE = "image"
    VIDEO = "video"


class SamplePost(Base):
    """Sample post model for gallery display."""

    __tablename__ = "sample_posts"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    creator_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    media_type: Mapped[MediaType] = mapped_column(
        SQLEnum(MediaType, values_callable=lambda x: [e.value for e in x]),
        default=MediaType.IMAGE,
        nullable=False,
    )
    media_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    thumbnail_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    caption: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array as string
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SamplePost(id={self.id}, creator={self.creator_name})>"
