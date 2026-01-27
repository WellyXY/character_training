"""Character model."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class CharacterStatus(str, enum.Enum):
    """Character status enum."""
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class Character(Base):
    """Character model for AI character management."""

    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    gender: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[CharacterStatus] = mapped_column(
        SQLEnum(CharacterStatus, values_callable=lambda x: [e.value for e in x]),
        default=CharacterStatus.DRAFT,
        nullable=False,
    )
    profile_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    canonical_prompt_block: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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

    # Relationships
    images: Mapped[list["Image"]] = relationship(
        "Image",
        back_populates="character",
        cascade="all, delete-orphan",
    )
    videos: Mapped[list["Video"]] = relationship(
        "Video",
        back_populates="character",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Character(id={self.id}, name={self.name})>"
