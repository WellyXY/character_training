"""Character management skill."""
import json
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.models.character import Character, CharacterStatus
from app.models.image import Image, ImageType


class CharacterSkill(BaseSkill):
    """Skill for managing characters and their base images."""

    name = "character"
    description = "Manage AI characters - create, update, and handle base images"

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Execute character management action."""
        if action == "create":
            return await self._create_character(params, db)
        elif action == "update":
            return await self._update_character(params, character_id, db)
        elif action == "get":
            return await self._get_character(character_id, db)
        elif action == "list":
            return await self._list_characters(db)
        elif action == "list_base_images":
            return await self._list_base_images(character_id, db)
        elif action == "add_base_image":
            return await self._add_base_image(params, character_id, db)
        elif action == "remove_base_image":
            return await self._remove_base_image(params, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["create", "update", "get", "list", "list_base_images", "add_base_image", "remove_base_image"]

    async def _create_character(
        self,
        params: dict[str, Any],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Create a new character."""
        name = params.get("name")
        if not name:
            return {"success": False, "error": "Name is required"}

        character = Character(
            name=name,
            description=params.get("description", ""),
            gender=params.get("gender"),
            status=CharacterStatus.DRAFT,
        )
        db.add(character)
        await db.commit()
        await db.refresh(character)

        return {
            "success": True,
            "character_id": character.id,
            "message": f"角色 '{name}' 創建成功！",
        }

    async def _update_character(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Update a character."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        result = await db.execute(
            select(Character).where(Character.id == character_id)
        )
        character = result.scalar_one_or_none()

        if not character:
            return {"success": False, "error": "Character not found"}

        if "name" in params:
            character.name = params["name"]
        if "description" in params:
            character.description = params["description"]
        if "status" in params:
            character.status = CharacterStatus(params["status"])

        await db.commit()
        await db.refresh(character)

        return {
            "success": True,
            "message": f"角色 '{character.name}' 更新成功！",
        }

    async def _get_character(
        self,
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Get character details."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        result = await db.execute(
            select(Character).where(Character.id == character_id)
        )
        character = result.scalar_one_or_none()

        if not character:
            return {"success": False, "error": "Character not found"}

        # Get base images
        img_result = await db.execute(
            select(Image)
            .where(Image.character_id == character_id)
            .where(Image.type == ImageType.BASE)
            .where(Image.is_approved == True)
        )
        base_images = img_result.scalars().all()

        return {
            "success": True,
            "character": {
                "id": character.id,
                "name": character.name,
                "description": character.description,
                "gender": character.gender,
                "status": character.status.value,
            },
            "base_images": [
                {"id": img.id, "url": img.image_url}
                for img in base_images
            ],
        }

    async def _list_characters(self, db: AsyncSession) -> dict[str, Any]:
        """List all characters."""
        result = await db.execute(
            select(Character).order_by(Character.created_at.desc())
        )
        characters = result.scalars().all()

        return {
            "success": True,
            "characters": [
                {
                    "id": c.id,
                    "name": c.name,
                    "status": c.status.value,
                }
                for c in characters
            ],
        }

    async def _list_base_images(
        self,
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """List base images for a character."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        result = await db.execute(
            select(Image)
            .where(Image.character_id == character_id)
            .where(Image.type == ImageType.BASE)
            .where(Image.is_approved == True)
            .order_by(Image.created_at.desc())
        )
        images = result.scalars().all()

        return {
            "success": True,
            "base_images": [
                {"id": img.id, "url": img.image_url}
                for img in images
            ],
            "count": len(images),
            "max_allowed": 3,
        }

    async def _add_base_image(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Add a base image to character."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        image_url = params.get("image_url")
        if not image_url:
            return {"success": False, "error": "Image URL is required"}

        # Check current base image count
        count_result = await db.execute(
            select(Image)
            .where(Image.character_id == character_id)
            .where(Image.type == ImageType.BASE)
            .where(Image.is_approved == True)
        )
        current_count = len(count_result.scalars().all())

        if current_count >= 3:
            return {
                "success": False,
                "error": "已達到最大 Base Image 數量限制 (3張)",
            }

        # Add new base image
        image = Image(
            character_id=character_id,
            type=ImageType.BASE,
            image_url=image_url,
            is_approved=True,
            metadata_json=json.dumps(params.get("metadata", {})),
        )
        db.add(image)
        await db.commit()
        await db.refresh(image)

        return {
            "success": True,
            "image_id": image.id,
            "message": f"Base Image 添加成功！({current_count + 1}/3)",
        }

    async def _remove_base_image(
        self,
        params: dict[str, Any],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Remove a base image."""
        image_id = params.get("image_id")
        if not image_id:
            return {"success": False, "error": "Image ID is required"}

        result = await db.execute(
            select(Image).where(Image.id == image_id)
        )
        image = result.scalar_one_or_none()

        if not image:
            return {"success": False, "error": "Image not found"}

        if image.type != ImageType.BASE:
            return {"success": False, "error": "Only base images can be removed"}

        await db.delete(image)
        await db.commit()

        return {
            "success": True,
            "message": "Base Image 已移除",
        }
