"""Tag model for sample post tagging."""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Tag(Base):
    """Tag model for categorizing sample posts."""

    __tablename__ = "tags"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # Relationship to sample posts via junction table
    sample_posts: Mapped[list["SamplePost"]] = relationship(
        "SamplePost",
        secondary="sample_post_tags",
        back_populates="tags_rel",
    )

    def __repr__(self) -> str:
        return f"<Tag(id={self.id}, name={self.name})>"


class SamplePostTag(Base):
    """Junction table for sample posts and tags (many-to-many)."""

    __tablename__ = "sample_post_tags"

    sample_post_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("sample_posts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )
