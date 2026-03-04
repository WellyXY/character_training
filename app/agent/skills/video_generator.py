"""Video generation skill using Parrot API (V1) or Veo3 via GMI (V2)."""
import asyncio
import json
import uuid
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.agent.skills.image_generator import ImageGeneratorSkill
from app.clients.parrot import get_parrot_client
from app.clients.gmi_video import get_gmi_video_client
from app.models.video import Video, VideoType, VideoStatus
from app.models.image import Image, ImageType
from app.services.storage import get_storage_service


class VideoGeneratorSkill(BaseSkill):
    """Skill for generating videos using Parrot (Pika) API."""

    name = "video_generator"
    description = "Generate videos using Parrot API (image-to-video)"

    def __init__(self):
        self.parrot = get_parrot_client()
        self.gmi_video = get_gmi_video_client()
        self.storage = get_storage_service()
        self.image_skill = ImageGeneratorSkill()

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Execute video generation."""
        if action == "generate":
            return await self._generate_video(params, character_id, db)
        elif action == "generate_with_image":
            return await self._generate_video_with_image_first(params, character_id, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["generate", "generate_with_image"]

    async def _generate_video(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Generate video from an existing image."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        source_image_url = params.get("source_image_url")
        if not source_image_url:
            return {"success": False, "error": "Source image URL is required"}

        prompt = params.get("prompt", "natural movement, slight motion")
        resolution = params.get("resolution")
        video_model = params.get("video_model", "v1")

        try:
            if video_model == "v2":
                # V2: Veo3 via GMI
                request_id = await self.gmi_video.create_image_to_video(
                    image_url=source_image_url,
                    prompt=prompt,
                    resolution="720P",
                )
                # Poll for completion (up to 10 minutes)
                video_url = None
                for _ in range(60):
                    await asyncio.sleep(10)
                    status_result = await self.gmi_video.get_request_status(request_id)
                    if status_result["status"] == "finished":
                        video_url = status_result.get("video_url")
                        break
                    elif status_result["status"] == "failed":
                        return {"success": False, "error": status_result.get("error", "Veo3 generation failed")}
                if not video_url:
                    return {"success": False, "error": "Veo3 generation timed out"}
                result = {"video_url": video_url, "thumbnail_url": None, "duration": 8}
            else:
                # V1: Parrot/Pika
                video_id = await self.parrot.create_image_to_video(
                    image_source=source_image_url,
                    prompt_text=prompt,
                    resolution=resolution,
                )
                result = await self.parrot.wait_for_video(video_id)

            video_url = result.get("video_url")
            if not video_url:
                return {"success": False, "error": "No video URL in response"}

            # Download and save the video locally
            saved = await self.storage.save_from_url(video_url, db, prefix="video")

            # Determine video type
            video_type = VideoType.VLOG
            if "dance" in prompt.lower():
                video_type = VideoType.DANCE
            elif "lipsync" in prompt.lower() or "sing" in prompt.lower():
                video_type = VideoType.LIPSYNC

            # Create video record
            video = Video(
                character_id=character_id,
                type=video_type,
                video_url=saved["url"],
                thumbnail_url=result.get("thumbnail_url"),
                duration=result.get("duration"),
                status=VideoStatus.COMPLETED,
                metadata_json=json.dumps({
                    "prompt": prompt,
                    "source_image_url": source_image_url,
                    "resolution": resolution,
                    "parrot_job_id": video_id,
                }),
            )
            db.add(video)
            await db.commit()
            await db.refresh(video)

            return {
                "success": True,
                "video_id": video.id,
                "video_url": saved["full_url"],
                "thumbnail_url": result.get("thumbnail_url"),
                "duration": result.get("duration"),
                "message": "Video generated successfully!",
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    async def _generate_video_with_image_first(
        self,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Generate video by first creating an image, then animating it."""
        if not character_id:
            return {"success": False, "error": "Character ID is required"}

        image_prompt = params.get("image_prompt", "")
        video_prompt = params.get("video_prompt", "natural movement, slight motion")
        aspect_ratio = params.get("aspect_ratio", "9:16")
        resolution = params.get("resolution")
        reference_image_path = params.get("reference_image_path")
        reference_image_mode = params.get("reference_image_mode")

        # Step 1: Generate the image first (with reference image if provided)
        image_result = await self.image_skill.generate_content(
            character_id=character_id,
            prompt=image_prompt,
            aspect_ratio=aspect_ratio,
            style=params.get("style"),
            cloth=params.get("cloth"),
            reference_image_path=reference_image_path,
            reference_image_mode=reference_image_mode,
            db=db,
        )

        if not image_result.get("success"):
            return {
                "success": False,
                "error": f"Image generation failed: {image_result.get('error')}",
            }

        source_image_url = image_result["image_url"]

        # Step 2: Generate video from the image
        video_result = await self._generate_video(
            params={
                "source_image_url": source_image_url,
                "prompt": video_prompt,
                "resolution": resolution,
                "video_model": params.get("video_model", "v1"),
            },
            character_id=character_id,
            db=db,
        )

        if video_result.get("success"):
            video_result["source_image_id"] = image_result.get("image_id")
            video_result["source_image_url"] = source_image_url
            video_result["message"] = "Both image and video generated successfully!"

        return video_result

    async def generate(
        self,
        character_id: str,
        source_image_url: str,
        prompt: str = "natural movement",
        resolution: Optional[str] = None,
        db: AsyncSession = None,
    ) -> dict[str, Any]:
        """
        Convenience method to generate video.

        Used by the agent for confirmed generations.
        """
        return await self._generate_video(
            params={
                "source_image_url": source_image_url,
                "prompt": prompt,
                "resolution": resolution,
            },
            character_id=character_id,
            db=db,
        )
