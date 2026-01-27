"""Base skill class."""
from abc import ABC, abstractmethod
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession


class BaseSkill(ABC):
    """Abstract base class for all skills."""

    name: str = "base"
    description: str = "Base skill"

    @abstractmethod
    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """
        Execute a skill action.

        Args:
            action: The specific action to perform
            params: Parameters for the action
            character_id: Optional character ID for context
            db: Database session

        Returns:
            Result dictionary with status and data
        """
        pass

    def get_actions(self) -> list[str]:
        """Get list of available actions for this skill."""
        return []
