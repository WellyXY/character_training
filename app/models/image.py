"""Image model."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Boolean, Float, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class ImageType(str, enum.Enum):
    """Image type enum."""
    BASE = "base"
    SCENE = "scene"
    REFERENCE_OUTPUT = "reference_output"
    CONTENT = "content"


class ImageStatus(str, enum.Enum):
    """Image generation status enum."""
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


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
        SQLEnum(ImageType),
        default=ImageType.CONTENT,
        nullable=False,
    )
    status: Mapped[ImageStatus] = mapped_column(
        SQLEnum(ImageStatus),
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
