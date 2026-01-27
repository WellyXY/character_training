"""Image model."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Boolean, Float, ForeignKey
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class ImageType(str, enum.Enum):
    """Image type enum."""
    BASE = "base"
    SCENE = "scene"
    REFERENCE_OUTPUT = "reference_output"
    CONTENT = "content"


class ImageTypeColumn(TypeDecorator):
    """Store ImageType as string to avoid PostgreSQL enum issues."""

    cache_ok = True
    impl = String(32)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, ImageType):
            return value.value
        if isinstance(value, str):
            try:
                return ImageType(value.lower()).value
            except ValueError:
                return ImageType.CONTENT.value
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, ImageType):
            return value
        if isinstance(value, str):
            try:
                return ImageType(value.lower())
            except ValueError:
                return ImageType.CONTENT
        return value


class ImageStatus(str, enum.Enum):
    """Image generation status enum."""
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class ImageStatusColumn(TypeDecorator):
    """Store ImageStatus as string to avoid PostgreSQL enum issues."""

    cache_ok = True
    impl = String(16)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, ImageStatus):
            return value.value
        if isinstance(value, str):
            try:
                return ImageStatus(value.lower()).value
            except ValueError:
                return ImageStatus.COMPLETED.value
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, ImageStatus):
            return value
        if isinstance(value, str):
            try:
                return ImageStatus(value.lower())
            except ValueError:
                return ImageStatus.COMPLETED
        return value


class Image(Base):
    """Image model for generated images."""

    __tablename__ = "images"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    character_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[ImageType] = mapped_column(
        ImageTypeColumn(),
        default=ImageType.CONTENT,
        nullable=False,
    )
    status: Mapped[ImageStatus] = mapped_column(
        ImageStatusColumn(),
        default=ImageStatus.COMPLETED,
        nullable=False,
    )
    task_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Nullable for generating state
    pose: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    expression: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    consistency_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    feedback_rating: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    feedback_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    character: Mapped["Character"] = relationship("Character", back_populates="images")

    def __repr__(self) -> str:
        return f"<Image(id={self.id}, type={self.type})>"
