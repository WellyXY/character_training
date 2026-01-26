"""Image editing skill using Seedream API with reference images."""
import json
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.seedream import get_seedream_client
from app.models.image import Image, ImageType
from app.services.storage import get_storage_service


class ImageEditorSkill(BaseSkill):
    """Skill for editing images using Seedream API with reference images."""

    name = "image_editor"
    description = "Edit images using Seedream 4.0 with source image as reference"

    def __init__(self):
        self.seedream = get_seedream_client()
        self.storage = get_storage_service()

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Execute image editing."""
        if action == "edit":
            return await self._edit_image(params, character_id, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["edit"]

    def _parse_aspect_ratio(self, aspect_ratio: str) -> tuple[int, int]:
        """Parse aspect ratio string to width, height."""
        ratios = {
            "9:16": (1024, 1820),
            "1:1": (1024, 1024),
            "16:9": (1820, 1024),
        }
        return ratios.get(aspect_ratio, (1024, 1820))

    async def _edit_image(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """
        Edit an image using Seedream.

        The source image is passed as a reference image, and the prompt
        describes the desired edits.
        """
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        prompt = params.get("prompt", "")
        source_image_path = params.get("source_image_path", "")

        if not prompt:
            return {"success": False, "error": "Prompt is required"}
        if not source_image_path:
            return {"success": False, "error": "Source image path is required"}

        aspect_ratio = params.get("aspect_ratio", "9:16")
        width, height = self._parse_aspect_ratio(aspect_ratio)

        # Get full URL for the source image
        source_image_url = self.storage.get_full_url(source_image_path)

        # Build reference images list
        reference_images = [source_image_url]

        # Add additional reference image if provided
        additional_ref = params.get("additional_reference_path")
        if additional_ref:
            additional_url = self.storage.get_full_url(additional_ref)
            reference_images.append(additional_url)

        try:
            # Generate edited image with Seedream using source as reference
            result = await self.seedream.generate(
                prompt=prompt,
                width=width,
                height=height,
                reference_images=reference_images,
            )

            image_url = result.get("image_url")
            if not image_url:
                return {"success": False, "error": "No image URL in response"}

            # Download and save the edited image
            saved = await self.storage.save_from_url(image_url, db, prefix="edited")

            # Create image record (type: content)
            metadata = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "seed": result.get("seed"),
                "edit_type": params.get("edit_type"),
                "edit_instruction": params.get("edit_instruction"),
                "source_image_path": source_image_path,
            }
            if additional_ref:
                metadata["additional_reference_path"] = additional_ref

            image = Image(
                character_id=character_id,
                type=ImageType.CONTENT,
                image_url=saved["url"],
                is_approved=False,
                metadata_json=json.dumps(metadata),
            )
            db.add(image)
            await db.commit()
            await db.refresh(image)

            return {
                "success": True,
                "image_id": image.id,
                "image_url": saved["full_url"],
                "message": "Image edited successfully!",
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def edit(
        self,
        character_id: str,
        prompt: str,
        source_image_path: str,
        aspect_ratio: str = "9:16",
        edit_type: Optional[str] = None,
        edit_instruction: Optional[str] = None,
        additional_reference_path: Optional[str] = None,
        db: AsyncSession = None,
    ) -> dict[str, Any]:
        """
        Convenience method to edit an image.

        Args:
            character_id: ID of the character
            prompt: Optimized edit prompt
            source_image_path: Path to the source image
            aspect_ratio: Output aspect ratio
            edit_type: Type of edit (background, outfit, etc.)
            edit_instruction: Original user instruction
            additional_reference_path: Optional additional reference image
            db: Database session

        Returns:
            Result dict with success status and image info
        """
        return await self._edit_image(
            params={
                "prompt": prompt,
                "source_image_path": source_image_path,
                "aspect_ratio": aspect_ratio,
                "edit_type": edit_type,
                "edit_instruction": edit_instruction,
                "additional_reference_path": additional_reference_path,
            },
            character_id=character_id,
            db=db,
        )
