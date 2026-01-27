"""Video model."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Float, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class VideoType(str, enum.Enum):
    """Video type enum."""
    VLOG = "vlog"
    DANCE = "dance"
    LIPSYNC = "lipsync"


class VideoStatus(str, enum.Enum):
    """Video generation status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Video(Base):
    """Video model for generated videos."""

    __tablename__ = "videos"

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
    type: Mapped[VideoType] = mapped_column(
        SQLEnum(VideoType, values_callable=lambda x: [e.value for e in x]),
        default=VideoType.VLOG,
        nullable=False,
    )
    video_url: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    source_image_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    metadata_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[VideoStatus] = mapped_column(
        SQLEnum(VideoStatus, values_callable=lambda x: [e.value for e in x]),
        default=VideoStatus.PENDING,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    character: Mapped["Character"] = relationship("Character", back_populates="videos")

    def __repr__(self) -> str:
        return f"<Video(id={self.id}, type={self.type})>"
