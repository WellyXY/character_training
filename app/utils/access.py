"""Access control helpers."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.character import Character
from app.models.user import User
from app.models.user_character_access import UserCharacterAccess


async def get_character_if_accessible(
    character_id: str,
    current_user: User,
    db: AsyncSession,
) -> Character | None:
    """Return the Character if current_user can access it, else None.

    Access is granted when:
    - user is admin, OR
    - user owns the character, OR
    - admin has explicitly granted access via UserCharacterAccess
    """
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()
    if not character:
        return None

    if current_user.is_admin:
        return character

    if character.user_id == current_user.id:
        return character

    # Check explicit grant
    access_result = await db.execute(
        select(UserCharacterAccess)
        .where(UserCharacterAccess.user_id == current_user.id)
        .where(UserCharacterAccess.character_id == character_id)
    )
    if access_result.scalar_one_or_none():
        return character

    return None
