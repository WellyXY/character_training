"""Character model."""
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime
from sqlalchemy.types import TypeDecorator
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class CharacterStatus(str, enum.Enum):
    """Character status enum."""
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class CharacterStatusType(TypeDecorator):
    """Normalize status values to match enum casing."""

    cache_ok = True
    impl = String(16)

    def process_bind_param(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if isinstance(value, CharacterStatus):
            return value.value
        if isinstance(value, str):
            try:
                return CharacterStatus(value.lower()).value
            except ValueError:
                return CharacterStatus.DRAFT.value
        return value

    def process_result_value(self, value, dialect):  # type: ignore[override]
        if value is None:
            return None
        if isinstance(value, CharacterStatus):
            return value
        if isinstance(value, str):
            try:
                return CharacterStatus(value.lower())
            except ValueError:
                return CharacterStatus.DRAFT
        return value


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
        CharacterStatusType(),
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
