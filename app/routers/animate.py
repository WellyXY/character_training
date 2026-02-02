"""Animate router for image-to-video generation."""
import asyncio
import json
import logging
import os
import subprocess
import tempfile
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db, async_session
from app.clients.gemini import get_gemini_client
from app.clients.parrot import get_parrot_client
from app.clients.seedream import get_seedream_client
from app.services.storage import get_storage_service, StorageService
from app.models.video import Video, VideoType as DBVideoType, VideoStatus as DBVideoStatus
from app.models.image import Image, ImageType, ImageStatus

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


async def _extract_video_first_frame(
    video_url: str,
    db: AsyncSession,
    storage: StorageService,
) -> str:
    """
    Extract first frame from video and save to storage.

    Args:
        video_url: URL of the video (can be relative or absolute)
        db: Database session
        storage: Storage service instance

    Returns:
        Storage URL of the extracted frame
    """
    # Get full URL for the video
    full_video_url = storage.get_full_url(video_url)

    # Download video to temp file
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(full_video_url)
        resp.raise_for_status()
        video_bytes = resp.content

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_video:
        tmp_video.write(video_bytes)
        tmp_video_path = tmp_video.name

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp_frame:
        tmp_frame_path = tmp_frame.name

    try:
        # Extract first frame with ffmpeg
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-i", tmp_video_path,
                "-vframes", "1",
                "-f", "image2",
                tmp_frame_path,
            ],
            check=True,
            capture_output=True,
        )

        # Read frame bytes and save to storage
        with open(tmp_frame_path, "rb") as f:
            frame_bytes = f.read()

        saved = await storage.save_bytes(
            frame_bytes,
            filename="first_frame.png",
            content_type="image/png",
            db=db,
        )
        # Commit so the frame is available for Seedream to fetch via HTTP
        await db.commit()
        return saved["url"]
    finally:
        if os.path.exists(tmp_video_path):
            os.unlink(tmp_video_path)
        if os.path.exists(tmp_frame_path):
            os.unlink(tmp_frame_path)


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
    add_subtitles: bool = False
    match_reference_pose: bool = False


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
    gemini = get_gemini_client()
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
        response = await gemini.analyze_image(
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
    If reference_video_url is provided, uses Pika Addition API with pose-matching.
    Otherwise, uses standard image-to-video API.
    Creates a Video record in the database.
    """
    parrot = get_parrot_client()
    storage = get_storage_service()

    # Get full URL for the image
    image_url = storage.get_full_url(request.image_url)

    # Check if using Addition API (reference video provided)
    use_addition_api = bool(request.reference_video_url)

    # Track intermediate image for metadata
    intermediate_image_id = None
    first_frame_url = None

    try:
        if use_addition_api:
            # Build prompt for Addition API with /pika2p5_animate prefix
            video_duration = request.reference_video_duration or 0
            enhanced_prompt = build_addition_prompt(request.prompt, video_duration)

            # Get full URL for the reference video
            reference_video_url = storage.get_full_url(request.reference_video_url)

            # Determine which image to use for Addition API
            image_url_for_addition = image_url

            # === Optional pose-matching pre-processing ===
            if request.match_reference_pose:
                # 1. Extract first frame from reference video
                logger.info("Extracting first frame from reference video...")
                first_frame_url = await _extract_video_first_frame(
                    request.reference_video_url,
                    db,
                    storage,
                )
                logger.info("First frame extracted: %s", first_frame_url)

                # 2. Generate pose-matched image using Seedream
                # Image order: [image 1 = user's selected image, image 2 = first frame from reference video]
                seedream = get_seedream_client()
                pose_prompt = (
                    f"Use image 1 (first reference image) for the character's face, body features, clothing, and style. "
                    f"Use image 2 (second reference image) for the exact pose, body position, camera angle, and framing. "
                    f"Combine: character identity from image 1 with pose/composition from image 2. "
                    f"Photorealistic, seamless blend, matching lighting and skin tone. "
                    f"{request.prompt}"
                )
                logger.info("Generating pose-matched image with Seedream...")

                pose_matched_result = await seedream.generate(
                    prompt=pose_prompt,
                    width=1024,
                    height=1024,
                    reference_images=[image_url, storage.get_full_url(first_frame_url)],
                )

                pose_matched_image_url = pose_matched_result.get("image_url")
                if not pose_matched_image_url:
                    raise ValueError("Seedream did not return an image URL for pose matching")

                logger.info("Pose-matched image generated: %s", pose_matched_image_url[:100])

                # 3. Save intermediate image to database as content image
                saved = await storage.save_from_url(pose_matched_image_url, db, prefix="content")
                intermediate_image = Image(
                    character_id=request.character_id,
                    type=ImageType.CONTENT,
                    image_url=saved["url"],
                    status=ImageStatus.COMPLETED,
                    is_approved=False,
                    metadata_json=json.dumps({
                        "prompt": pose_prompt,
                        "source": "video_pose_match",
                        "reference_video_first_frame": first_frame_url,
                        "original_image_id": request.image_id,
                    }),
                )
                db.add(intermediate_image)
                await db.commit()
                await db.refresh(intermediate_image)
                intermediate_image_id = intermediate_image.id
                logger.info("Intermediate pose-matched image saved: %s", intermediate_image.id)

                # 4. Use the new image for Addition API (instead of original)
                image_url_for_addition = storage.get_full_url(saved["url"])

            logger.info(
                "Starting Addition API video generation for image %s with ref video, prompt: %s",
                intermediate_image_id or request.image_id,
                enhanced_prompt[:150],
            )

            # Create video generation job using Addition API
            video_job_id = await parrot.create_addition_video(
                video_source=reference_video_url,
                image_source=image_url_for_addition,
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
            "add_subtitles": request.add_subtitles,
        }
        if use_addition_api:
            metadata["api_type"] = "addition"
            metadata["reference_video_url"] = request.reference_video_url
            metadata["reference_video_duration"] = request.reference_video_duration
            metadata["match_reference_pose"] = request.match_reference_pose
            # Include pose-matching intermediate image info when enabled
            if intermediate_image_id:
                metadata["intermediate_image_id"] = intermediate_image_id
            if first_frame_url:
                metadata["reference_video_first_frame"] = first_frame_url

        # Create Video record immediately with PROCESSING status
        # For Addition API with pose matching, use the intermediate image as source
        video = Video(
            character_id=request.character_id,
            type=DBVideoType.VLOG,
            video_url=None,  # Will be set when complete
            thumbnail_url=None,
            duration=None,
            source_image_id=intermediate_image_id if intermediate_image_id else request.image_id,
            status=DBVideoStatus.PROCESSING,
            metadata_json=json.dumps(metadata),
        )

        db.add(video)
        await db.commit()
        await db.refresh(video)

        logger.info("Video record created with PROCESSING status: %s", video.id)

        # Start background task to poll for completion
        # This allows the request to return immediately
        logger.info(
            "Starting background task for video %s, add_subtitles=%s",
            video.id,
            request.add_subtitles,
        )
        task = asyncio.create_task(
            _poll_video_completion(
                video_id=video.id,
                parrot_job_id=video_job_id,
                use_addition_api=use_addition_api,
                metadata=metadata,
                add_subtitles=request.add_subtitles,
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
    add_subtitles: bool = False,
):
    """Background task to poll for video completion and update database."""
    parrot = get_parrot_client()
    storage = get_storage_service()

    try:
        # Poll for video completion with progress updates (up to 5 minutes)
        timeout = 300
        poll_interval = 5
        elapsed = 0
        last_progress = 0
        result = None

        while elapsed < timeout:
            poll_result = await parrot.get_video_status(parrot_job_id, use_addition_api=use_addition_api)
            status = poll_result.get("status", "").lower()
            progress = poll_result.get("raw", {}).get("progress") or 0

            logger.info("Video %s poll: status=%s, progress=%d%%", video_id, status, progress)

            # Update progress in DB if changed
            if progress != last_progress:
                last_progress = progress
                async with async_session() as progress_db:
                    video_result = await progress_db.execute(
                        select(Video).where(Video.id == video_id)
                    )
                    video = video_result.scalar_one_or_none()
                    if video:
                        metadata["progress"] = progress
                        video.metadata_json = json.dumps(metadata)
                        await progress_db.commit()

            if status in ("finished", "completed", "done", "success"):
                if poll_result.get("video_url"):
                    result = poll_result
                    break
                else:
                    logger.warning("Video completed but no URL: %s", poll_result)

            if status in ("failed", "error"):
                raw = poll_result.get("raw", {})
                error_msg = raw.get("error") or raw.get("message") or str(raw)
                raise ValueError(f"Video generation failed: {error_msg}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        if not result:
            raise TimeoutError(f"Video generation timed out after {timeout} seconds")

        video_url = result.get("video_url")
        if not video_url:
            raise ValueError("Video generation completed but no URL returned")

        logger.info("Video generated: %s", video_url)

        # Use a new database session for the background task
        async with async_session() as db:
            # Download video
            import httpx
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(video_url)
                response.raise_for_status()
                video_bytes = response.content
                content_type = response.headers.get("content-type", "video/mp4")

            # Get video dimensions using ffprobe
            video_width = None
            video_height = None
            video_duration = None
            try:
                import tempfile
                import subprocess
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                    tmp.write(video_bytes)
                    tmp_path = tmp.name

                probe_cmd = [
                    "ffprobe", "-v", "error",
                    "-select_streams", "v:0",
                    "-show_entries", "stream=width,height,duration",
                    "-of", "csv=p=0",
                    tmp_path
                ]
                probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                if probe_result.returncode == 0:
                    parts = probe_result.stdout.strip().split(",")
                    if len(parts) >= 2:
                        video_width = int(parts[0]) if parts[0] else None
                        video_height = int(parts[1]) if parts[1] else None
                    if len(parts) >= 3 and parts[2]:
                        video_duration = float(parts[2])
                    logger.info(f"Video dimensions: {video_width}x{video_height}, duration: {video_duration}s")

                import os
                os.unlink(tmp_path)
            except Exception as e:
                logger.warning(f"Could not get video dimensions: {e}")

            # Add subtitles if requested
            if add_subtitles:
                logger.info("Adding subtitles to video...")
                try:
                    from app.services.subtitle import process_video_with_subtitles
                    video_bytes = await process_video_with_subtitles(video_bytes, "video.mp4")
                    logger.info("Subtitles added successfully")
                except Exception as e:
                    logger.warning(f"Failed to add subtitles, using original video: {e}")

            # Save video to storage
            logger.info("Saving video to storage, size: %d bytes", len(video_bytes))
            saved = await storage.save_bytes(
                video_bytes,
                "animated.mp4",
                content_type,
                db,
            )
            local_video_url = saved["url"]
            logger.info("Video saved to storage: %s", local_video_url)

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
            logger.info("Updating video record %s to COMPLETED", video_id)
            video_result = await db.execute(
                select(Video).where(Video.id == video_id)
            )
            video = video_result.scalar_one_or_none()
            if video:
                video.video_url = local_video_url
                video.thumbnail_url = thumbnail_url
                video.duration = video_duration or result.get("duration")
                video.status = DBVideoStatus.COMPLETED

                # Update metadata with video dimensions
                if video_width and video_height:
                    metadata["width"] = video_width
                    metadata["height"] = video_height
                if video_duration:
                    metadata["duration"] = video_duration
                metadata["progress"] = 100
                video.metadata_json = json.dumps(metadata)

                await db.commit()
                await db.refresh(video)
                logger.info("Video completed and saved: %s, status=%s", video.id, video.status)
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
