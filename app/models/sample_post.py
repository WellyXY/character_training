"""SamplePost model for Sample Gallery."""
import uuid
from datetime import datetime
from typing import Optional
import enum

from sqlalchemy import String, Text, DateTime
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MediaType(str, enum.Enum):
    """Media type enum."""
    IMAGE = "image"
    VIDEO = "video"


class MediaTypeColumn(TypeDecorator):
    """Store MediaType as string to avoid PostgreSQL enum issues."""

    cache_ok = True
    impl = String(16)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, MediaType):
            return value.value
        if isinstance(value, str):
            try:
                return MediaType(value.lower()).value
            except ValueError:
                return MediaType.IMAGE.value
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, MediaType):
            return value
        if isinstance(value, str):
            try:
                return MediaType(value.lower())
            except ValueError:
                return MediaType.IMAGE
        return value


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
        MediaTypeColumn(),
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
