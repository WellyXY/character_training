"""Animate router for image-to-video generation."""
import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, async_session
from app.clients.gpt import get_gpt_client
from app.clients.parrot import get_parrot_client
from app.services.storage import get_storage_service
from app.models.video import Video, VideoType as DBVideoType, VideoStatus as DBVideoStatus

logger = logging.getLogger(__name__)

# Track background tasks to prevent garbage collection
_background_tasks: set = set()

router = APIRouter()


def build_addition_prompt(base_prompt: str, video_duration: float) -> str:
    """
    Build prompt for Pika Addition API.

    Args:
        base_prompt: The base prompt text
        video_duration: Duration of reference video in seconds

    Returns:
        Formatted prompt with /pika2p5_animate prefix and duration suffix
    """
    prompt = f"/pika2p5_animate {base_prompt.strip()}"
    if video_duration > 10:
        prompt += " --15sec"
    elif video_duration >= 5:
        prompt += " --10sec"
    return prompt


class AnalyzeRequest(BaseModel):
    """Request for image analysis."""
    image_id: str
    image_url: str


class AnalyzeResponse(BaseModel):
    """Response from image analysis."""
    suggested_prompt: str
    image_analysis: str
    suggested_motion_types: list[str]


class GenerateRequest(BaseModel):
    """Request for video generation."""
    image_id: str
    image_url: str
    character_id: str
    prompt: str
    reference_video_url: Optional[str] = None
    reference_video_duration: Optional[float] = None


class GenerateResponse(BaseModel):
    """Response from video generation."""
    success: bool
    video_id: Optional[str] = None
    video_url: Optional[str] = None
    message: str


@router.post("/animate/analyze", response_model=AnalyzeResponse)
async def analyze_image_for_animation(
    request: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Analyze an image and suggest video generation prompts.
    Uses GPT-4o Vision to understand the image content.
    """
    import base64
    gpt = get_gpt_client()
    storage = get_storage_service()

    # Convert local image to base64 data URL for GPT-4o Vision
    # (GPT cannot access localhost URLs)
    if request.image_url.startswith("/uploads/"):
        file_id = request.image_url.replace("/uploads/", "")
        blob = await storage.get_file_blob(file_id, db)
        if not blob:
            raise HTTPException(status_code=404, detail="Image file not found")

        mime_type = blob.content_type or "image/jpeg"
        base64_data = base64.b64encode(blob.data).decode("utf-8")
        image_url = f"data:{mime_type};base64,{base64_data}"
    else:
        # External URL - use as is
        image_url = storage.get_full_url(request.image_url)

    analysis_prompt = """Analyze this image and suggest how it could be animated as a short video.

CRITICAL: The person's facial features, face structure, and identity MUST remain completely unchanged during animation. Only suggest body movements and camera motions that will NOT alter or distort the face.

Consider:
1. The subject's pose and position
2. Natural movements that would fit the scene (avoid extreme head movements that could distort facial features)
3. Camera movements that would enhance the composition
4. Movements that keep the face stable and recognizable

Respond in JSON format:
{
    "image_description": "Brief description of what's in the image",
    "suggested_prompt": "A detailed video generation prompt describing the motion/animation",
    "motion_types": ["list", "of", "suggested", "motion", "types"]
}

The suggested_prompt should be specific and describe:
- What movement or action should happen (while preserving facial identity)
- How the camera might move (if applicable)
- The mood or style of the animation
- MUST include instruction to maintain the person's exact facial features and identity

Keep the prompt concise but descriptive (1-2 sentences). Always include "maintain exact facial features" or similar phrasing."""

    try:
        response = await gpt.analyze_image(
            image_url=image_url,
            prompt=analysis_prompt,
            detail="high",
        )

        # Parse JSON response
        import re

        # Try to extract JSON from the response
        try:
            result = json.loads(response)
        except json.JSONDecodeError:
            # Try to find JSON in code blocks
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
            if json_match:
                result = json.loads(json_match.group(1))
            else:
                # Try to find JSON object pattern
                json_match = re.search(r'\{[\s\S]*\}', response)
                if json_match:
                    result = json.loads(json_match.group(0))
                else:
                    raise ValueError(f"Could not parse JSON from response: {response[:500]}")

        return AnalyzeResponse(
            suggested_prompt=result.get("suggested_prompt", ""),
            image_analysis=result.get("image_description", ""),
            suggested_motion_types=result.get("motion_types", []),
        )

    except Exception as e:
        logger.error("Failed to analyze image: %s", str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze image: {str(e)}"
        )


@router.post("/animate/generate", response_model=GenerateResponse)
async def generate_animation(
    request: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a video from an image using Parrot API.
    If reference_video_url is provided, uses Pika Addition API.
    Otherwise, uses standard image-to-video API.
    Creates a Video record in the database.
    """
    parrot = get_parrot_client()
    storage = get_storage_service()

    # Get full URL for the image
    image_url = storage.get_full_url(request.image_url)

    # Check if using Addition API (reference video provided)
    use_addition_api = bool(request.reference_video_url)

    try:
        if use_addition_api:
            # Build prompt for Addition API with /pika2p5_animate prefix
            video_duration = request.reference_video_duration or 0
            enhanced_prompt = build_addition_prompt(request.prompt, video_duration)

            # Get full URL for the reference video
            reference_video_url = storage.get_full_url(request.reference_video_url)

            logger.info(
                "Starting Addition API video generation for image %s with ref video, prompt: %s",
                request.image_id,
                enhanced_prompt[:150],
            )

            # Create video generation job using Addition API
            video_job_id = await parrot.create_addition_video(
                video_source=reference_video_url,
                image_source=image_url,
                prompt_text=enhanced_prompt,
            )
        else:
            # Add face preservation emphasis to the prompt
            enhanced_prompt = f"Maintain exact facial features and identity unchanged. {request.prompt}"

            logger.info(
                "Starting video generation for image %s with prompt: %s",
                request.image_id,
                enhanced_prompt[:150],
            )

            # Create video generation job using standard API
            video_job_id = await parrot.create_image_to_video(
                image_source=image_url,
                prompt_text=enhanced_prompt,
            )

        logger.info("Video job created: %s", video_job_id)

        # Build metadata
        metadata = {
            "original_prompt": request.prompt,
            "enhanced_prompt": enhanced_prompt,
            "source_image_id": request.image_id,
            "parrot_job_id": video_job_id,
        }
        if use_addition_api:
            metadata["api_type"] = "addition"
            metadata["reference_video_url"] = request.reference_video_url
            metadata["reference_video_duration"] = request.reference_video_duration

        # Create Video record immediately with PROCESSING status
        video = Video(
            character_id=request.character_id,
            type=DBVideoType.VLOG,
            video_url=None,  # Will be set when complete
            thumbnail_url=None,
            duration=None,
            source_image_id=request.image_id,
            status=DBVideoStatus.PROCESSING,
            metadata_json=json.dumps(metadata),
        )

        db.add(video)
        await db.commit()
        await db.refresh(video)

        logger.info("Video record created with PROCESSING status: %s", video.id)

        # Start background task to poll for completion
        # This allows the request to return immediately
        task = asyncio.create_task(
            _poll_video_completion(
                video_id=video.id,
                parrot_job_id=video_job_id,
                use_addition_api=use_addition_api,
                metadata=metadata,
            )
        )
        # Keep reference to prevent garbage collection
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)

        # Return immediately - frontend will poll for status
        return GenerateResponse(
            success=True,
            video_id=video.id,
            video_url=None,  # Not ready yet
            message="Video generation started. Check status for completion.",
        )

    except Exception as e:
        logger.error("Failed to start video generation: %s", str(e))
        return GenerateResponse(
            success=False,
            message=f"Failed to start video generation: {str(e)}",
        )


async def _poll_video_completion(
    video_id: str,
    parrot_job_id: str,
    use_addition_api: bool,
    metadata: dict,
):
    """Background task to poll for video completion and update database."""
    parrot = get_parrot_client()
    storage = get_storage_service()

    try:
        # Wait for video completion (up to 5 minutes)
        result = await parrot.wait_for_video(
            video_id=parrot_job_id,
            timeout=300,
            poll_interval=5,
            use_addition_api=use_addition_api,
        )

        video_url = result.get("video_url")
        if not video_url:
            raise ValueError("Video generation completed but no URL returned")

        logger.info("Video generated: %s", video_url)

        # Use a new database session for the background task
        async with async_session() as db:
            # Download and save video locally
            saved = await storage.save_from_url(video_url, db, prefix="animated")
            local_video_url = saved["url"]

            # Save thumbnail if available
            thumbnail_url = None
            if result.get("thumbnail_url"):
                try:
                    thumb_saved = await storage.save_from_url(
                        result["thumbnail_url"],
                        db,
                        prefix="thumb"
                    )
                    thumbnail_url = thumb_saved["url"]
                except Exception as e:
                    logger.warning("Failed to save thumbnail: %s", e)

            # Update video record with completed status
            video_result = await db.execute(
                select(Video).where(Video.id == video_id)
            )
            video = video_result.scalar_one_or_none()
            if video:
                video.video_url = local_video_url
                video.thumbnail_url = thumbnail_url
                video.duration = result.get("duration")
                video.status = DBVideoStatus.COMPLETED
                await db.commit()
                logger.info("Video completed and saved: %s", video.id)
            else:
                logger.error("Video record not found: %s", video_id)

    except Exception as e:
        logger.error("Video generation failed: %s", str(e))
        # Update video record with failed status
        async with async_session() as db:
            video_result = await db.execute(
                select(Video).where(Video.id == video_id)
            )
            video = video_result.scalar_one_or_none()
            if video:
                video.status = DBVideoStatus.FAILED
                metadata["error"] = str(e)
                video.metadata_json = json.dumps(metadata)
                await db.commit()
