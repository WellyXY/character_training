"""User-Character access control (many-to-many)."""
import uuid
from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserCharacterAccess(Base):
    """Explicit character access granted to a user by admin."""

    __tablename__ = "user_character_access"
    __table_args__ = (
        UniqueConstraint("user_id", "character_id", name="uq_user_character"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    character_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("characters.id", ondelete="CASCADE"), nullable=False, index=True
    )
