"""Image generation skill using Seedream API."""
import json
import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.seedream import get_seedream_client
from app.models.image import Image, ImageType, ImageStatus
from app.models.character import Character
from app.services.storage import get_storage_service


class ImageGeneratorSkill(BaseSkill):
    """Skill for generating images using Seedream API."""

    name = "image_generator"
    description = "Generate images using Seedream 4.5 API"

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
        """Execute image generation."""
        if action == "generate_base":
            return await self._generate_base_image(params, character_id, db)
        elif action == "generate_content":
            return await self._generate_content_image(params, character_id, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["generate_base", "generate_content"]

    def _parse_aspect_ratio(self, aspect_ratio: str) -> tuple[int, int]:
        """Parse aspect ratio string to width, height."""
        ratios = {
            "9:16": (1024, 1820),  # Portrait
            "1:1": (1024, 1024),   # Square
            "16:9": (1820, 1024),  # Landscape
        }
        return ratios.get(aspect_ratio, (1024, 1820))

    async def _get_base_images(
        self,
        character_id: str,
        db: AsyncSession,
        limit: int = 3,
    ) -> list[str]:
        """Get approved base images for a character."""
        result = await db.execute(
            select(Image)
            .where(Image.character_id == character_id)
            .where(Image.type == ImageType.BASE)
            .where(Image.is_approved == True)
            .order_by(Image.created_at.desc())
            .limit(limit)
        )
        images = result.scalars().all()
        return [self.storage.get_full_url(img.image_url) for img in images]

    async def _generate_base_image(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Generate a base image for character identity."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        prompt = params.get("prompt", "")
        if not prompt:
            return {"success": False, "error": "Prompt is required"}

        aspect_ratio = params.get("aspect_ratio", "9:16")
        width, height = self._parse_aspect_ratio(aspect_ratio)

        try:
            # Build reference images list from user-provided references
            reference_images = None
            user_reference_paths = params.get("reference_image_paths") or []
            # Also support single path for backward compat
            single_path = params.get("reference_image_path")
            if single_path and single_path not in user_reference_paths:
                user_reference_paths.append(single_path)
            if user_reference_paths:
                reference_images = [
                    self.storage.get_full_url(p) for p in user_reference_paths
                ]

            # Generate image with Seedream
            result = await self.seedream.generate(
                prompt=prompt,
                width=width,
                height=height,
                reference_images=reference_images,
            )

            image_url = result.get("image_url")
            if not image_url:
                return {"success": False, "error": "No image URL in response"}

            # Download and save the image locally
            saved = await self.storage.save_from_url(image_url, db, prefix="base")

            # Build metadata
            metadata = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "seed": result.get("seed"),
            }
            if user_reference_paths:
                metadata["reference_image_paths"] = user_reference_paths

            # Check if we should update an existing record or create new
            existing_image_id = params.get("existing_image_id")
            if existing_image_id:
                # Update existing record
                result_query = await db.execute(
                    select(Image).where(Image.id == existing_image_id)
                )
                image = result_query.scalar_one_or_none()
                if image:
                    image.image_url = saved["url"]
                    image.status = ImageStatus.COMPLETED
                    image.metadata_json = json.dumps(metadata)
                    await db.commit()
                    await db.refresh(image)
                else:
                    # Fallback: create new if not found
                    image = Image(
                        character_id=character_id,
                        type=ImageType.BASE,
                        image_url=saved["url"],
                        status=ImageStatus.COMPLETED,
                        is_approved=False,
                        metadata_json=json.dumps(metadata),
                    )
                    db.add(image)
                    await db.commit()
                    await db.refresh(image)
            else:
                # Create new image record
                image = Image(
                    character_id=character_id,
                    type=ImageType.BASE,
                    image_url=saved["url"],
                    status=ImageStatus.COMPLETED,
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
                "message": "Base Image generated successfully! Please approve it to add to the character.",
            }

        except Exception as e:
            # If we have an existing image, mark it as failed
            existing_image_id = params.get("existing_image_id")
            if existing_image_id:
                try:
                    result_query = await db.execute(
                        select(Image).where(Image.id == existing_image_id)
                    )
                    image = result_query.scalar_one_or_none()
                    if image:
                        image.status = ImageStatus.FAILED
                        image.error_message = str(e)
                        await db.commit()
                except Exception:
                    pass
            return {"success": False, "error": str(e)}

    async def _generate_content_image(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Generate a content image (must reference base images)."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        prompt = params.get("prompt", "")
        if not prompt:
            return {"success": False, "error": "Prompt is required"}

        # Get base images for reference (character consistency)
        base_image_urls = await self._get_base_images(character_id, db)

        # Build reference_images: base images first, then user reference image (if any)
        # - Base images: for face and body shape consistency
        # - User reference image: for pose/composition/atmosphere reference
        user_reference_path = params.get("reference_image_path")

        # If no base images and no user reference, we can't generate content
        if not base_image_urls and not user_reference_path:
            return {
                "success": False,
                "error": "Character has no Base Images. Please generate and approve Base Images first, or provide a reference image.",
            }

        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[ImageGenerator] Base images count: {len(base_image_urls)}")
        # Only log filename to avoid long URLs in logs
        ref_display = user_reference_path.split("/")[-1] if user_reference_path and "/" in user_reference_path else (user_reference_path[:30] + "..." if user_reference_path and len(user_reference_path) > 30 else user_reference_path)
        logger.info(f"[ImageGenerator] User reference: {ref_display}")

        # Get reference image mode to determine order
        reference_image_mode = params.get("reference_image_mode")
        logger.info(f"[ImageGenerator] Reference image mode: {reference_image_mode}")

        if user_reference_path:
            user_reference_url = self.storage.get_full_url(user_reference_path)

            if reference_image_mode == "face_swap":
                # Face swap: user reference first (preserve pose/background/outfit),
                # only 1 base image for face extraction (too many base images = base image dominates)
                face_base_images = base_image_urls[:1] if base_image_urls else []
                reference_images = [user_reference_url] + list(face_base_images)
                logger.info(f"[ImageGenerator] Face swap mode: user reference first, 1 base image for face only")
            else:
                # Other modes: base images first for character consistency
                reference_images = list(base_image_urls)
                reference_images.append(user_reference_url)  # User reference last
            logger.info(f"[ImageGenerator] Total reference images: {len(reference_images)}")
        else:
            reference_images = list(base_image_urls)

        aspect_ratio = params.get("aspect_ratio", "9:16")
        width, height = self._parse_aspect_ratio(aspect_ratio)

        try:
            # Generate image with Seedream using all reference images
            # The prompt uses [Reference Character] for base images (face/body)
            # and [Reference Pose/Composition/Style] for user reference (pose/atmosphere)
            result = await self.seedream.generate(
                prompt=prompt,
                width=width,
                height=height,
                reference_images=reference_images,
            )

            image_url = result.get("image_url")
            if not image_url:
                return {"success": False, "error": "No image URL in response"}

            # Download and save the image locally
            saved = await self.storage.save_from_url(image_url, db, prefix="content")

            # Build metadata
            metadata = {
                "prompt": prompt,
                "width": width,
                "height": height,
                "seed": result.get("seed"),
                "style": params.get("style"),
                "cloth": params.get("cloth"),
                "base_image_count": len(base_image_urls),
                "total_reference_count": len(reference_images),
            }
            # User reference was both analyzed by GPT-4V AND passed to Seedream
            if user_reference_path:
                metadata["user_reference_path"] = user_reference_path
                metadata["user_reference_passed_to_seedream"] = True

            # Check if we should update an existing record or create new
            existing_image_id = params.get("existing_image_id")
            if existing_image_id:
                # Update existing record
                result_query = await db.execute(
                    select(Image).where(Image.id == existing_image_id)
                )
                image = result_query.scalar_one_or_none()
                if image:
                    image.image_url = saved["url"]
                    image.status = ImageStatus.COMPLETED
                    image.metadata_json = json.dumps(metadata)
                    await db.commit()
                    await db.refresh(image)
                else:
                    # Fallback: create new if not found
                    image = Image(
                        character_id=character_id,
                        type=ImageType.CONTENT,
                        image_url=saved["url"],
                        status=ImageStatus.COMPLETED,
                        is_approved=False,
                        metadata_json=json.dumps(metadata),
                    )
                    db.add(image)
                    await db.commit()
                    await db.refresh(image)
            else:
                # Create new image record
                image = Image(
                    character_id=character_id,
                    type=ImageType.CONTENT,
                    image_url=saved["url"],
                    status=ImageStatus.COMPLETED,
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
                "message": "Image generated successfully!",
            }

        except Exception as e:
            # If we have an existing image, mark it as failed
            existing_image_id = params.get("existing_image_id")
            if existing_image_id:
                try:
                    result_query = await db.execute(
                        select(Image).where(Image.id == existing_image_id)
                    )
                    image = result_query.scalar_one_or_none()
                    if image:
                        image.status = ImageStatus.FAILED
                        image.error_message = str(e)
                        await db.commit()
                except Exception:
                    pass
            return {"success": False, "error": str(e)}

    async def generate_content(
        self,
        character_id: str,
        prompt: str,
        aspect_ratio: str = "9:16",
        style: Optional[str] = None,
        cloth: Optional[str] = None,
        reference_image_path: Optional[str] = None,
        reference_image_mode: Optional[str] = None,
        db: AsyncSession = None,
        existing_image_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Convenience method to generate content image.

        Used by the agent for confirmed generations.
        If existing_image_id is provided, updates the existing record instead of creating new.
        """
        return await self._generate_content_image(
            params={
                "prompt": prompt,
                "aspect_ratio": aspect_ratio,
                "style": style,
                "cloth": cloth,
                "reference_image_path": reference_image_path,
                "reference_image_mode": reference_image_mode,
                "existing_image_id": existing_image_id,
            },
            character_id=character_id,
            db=db,
        )
