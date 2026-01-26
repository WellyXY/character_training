"""File blob model for binary storage."""
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, LargeBinary
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class FileBlob(Base):
    """Binary file stored in the database."""

    __tablename__ = "file_blobs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<FileBlob(id={self.id}, filename={self.filename})>"

