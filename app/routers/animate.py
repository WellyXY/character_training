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
from app.models.character import Character
from app.models.user import User
from app.auth import get_current_user
from app.services.tokens import deduct_tokens, refund_tokens

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
    pose_image_aspect_ratio: str = "9:16"  # Aspect ratio for pose-matched image generation


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
    current_user: User = Depends(get_current_user),
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

CRITICAL: The person's facial features, face structure, and identity MUST remain completely unchanged during animation.

## Analysis Focus:

1. **Character Body Actions (MOST IMPORTANT)**: Based on the scene, pose, and mood, suggest natural or alluring body movements at a LIVELY, ENERGETIC pace — NOT slow motion:
   - Sensual/sexy scenes: quick hair flip, confident hip sway, running fingers through hair briskly, arching back with energy, shifting weight dynamically, biting lip, snapping a look over shoulder, playfully adjusting clothing strap
   - Casual/natural scenes: turning head swiftly with a bright smile, brushing hair behind ear, taking a deep breath, leaning forward with interest, crossing legs in one smooth motion, tilting head with a quick wink, laughing naturally
   - Dynamic scenes: walking briskly toward camera, spinning with momentum, sitting down in one fluid motion, standing up with confidence and purpose
   - The body action should match the mood and outfit in the image
   - **SPEED RULE**: All movements should feel natural real-time speed or slightly energetic. NEVER use words like "slowly", "gently", "gradually", "languidly". Instead use "smoothly", "swiftly", "confidently", "briskly", "naturally", "fluidly"

2. **Camera Movement (secondary)**: Complementary camera motion at matching pace:
   - Steady zoom in, smooth orbit, dolly forward, dynamic tilt

3. **Atmosphere**: Wind blowing hair, fabric swaying, light shifting — all at natural speed, never slow-motion

Respond in JSON format:
{
    "image_description": "Brief description of what's in the image including pose, outfit, setting, mood",
    "suggested_prompt": "A detailed video prompt combining character action + camera motion + atmosphere",
    "motion_types": ["list", "of", "suggested", "motion", "types"]
}

The suggested_prompt MUST:
- Lead with the CHARACTER'S BODY ACTION (what the person does), not the camera
- Use NATURAL or BRISK pacing words — NEVER "slowly", "gently", "gradually". Use "smoothly", "swiftly", "confidently", "briskly", "fluidly" instead
- Include a complementary camera movement
- Add atmospheric details (hair flowing, fabric moving, light shifting)
- Maintain the person's exact facial features and identity
- Be 2-3 sentences, vivid and specific

Example good prompts:
- "The woman flips her long hair back confidently while running her fingers through it with a sultry expression, her silk dress catching the breeze. Smooth dolly forward with golden light shifting across her skin. Maintain exact facial features."
- "She turns her head swiftly toward the camera with a bright smile, brushing hair behind her ear as she shifts her weight. Steady zoom in capturing the moment. Maintain exact facial features."
- "The woman arches her back and snaps a confident look over her shoulder, her lingerie strap sliding down naturally. Smooth orbit camera revealing the scene. Maintain exact facial features."

The motion_types should include both body actions AND camera movements, e.g. ["hair flip", "hip sway", "zoom in", "dolly forward"]."""

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
    current_user: User = Depends(get_current_user),
):
    """
    Generate a video from an image using Parrot API (costs 2 tokens).
    If reference_video_url is provided, uses Pika Addition API with pose-matching.
    Otherwise, uses standard image-to-video API.
    Creates a Video record in the database.
    """
    # Verify character exists (admin can access all, others only their own)
    if current_user.is_admin:
        char_result = await db.execute(
            select(Character).where(Character.id == request.character_id)
        )
    else:
        char_result = await db.execute(
            select(Character)
            .where(Character.id == request.character_id)
            .where(Character.user_id == current_user.id)
        )
    if not char_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Character not found")

    # Deduct tokens for video generation (2 tokens)
    await deduct_tokens(current_user, "video_generation", db)
    await db.commit()

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

                # 2. Get base images for character consistency (up to 3)
                base_images_result = await db.execute(
                    select(Image)
                    .where(Image.character_id == request.character_id)
                    .where(Image.type == ImageType.BASE)
                    .where(Image.is_approved == True)
                    .order_by(Image.created_at.desc())
                    .limit(3)
                )
                base_images = base_images_result.scalars().all()
                base_image_urls = [storage.get_full_url(img.image_url) for img in base_images]
                logger.info("Found %d approved base images for character", len(base_image_urls))

                # 3. Generate pose-matched image using Seedream
                # Image order: [base_images (1-3) for character identity, first_frame (last) for pose]
                seedream = get_seedream_client()

                # Build reference images list: base images first, then first frame for pose
                reference_images_for_pose = base_image_urls + [storage.get_full_url(first_frame_url)]
                num_base = len(base_image_urls)

                # Build prompt with explicit image order
                if num_base > 0:
                    pose_prompt = (
                        f"Use images 1-{num_base} (base reference images) for the character's face and body features to maintain identity consistency. "
                        f"Use image {num_base + 1} (last reference image) for the exact pose, body position, camera angle, and framing. "
                        f"Combine: character identity from images 1-{num_base} with pose/composition from image {num_base + 1}. "
                        f"Photorealistic, seamless blend, matching lighting and skin tone, no text, no watermark, no extra limbs."
                    )
                else:
                    # Fallback if no base images - use selected image
                    reference_images_for_pose = [image_url, storage.get_full_url(first_frame_url)]
                    pose_prompt = (
                        f"Use image 1 (first reference image) for the character's face, body features, clothing, and style. "
                        f"Use image 2 (second reference image) for the exact pose, body position, camera angle, and framing. "
                        f"Combine: character identity from image 1 with pose/composition from image 2. "
                        f"Photorealistic, seamless blend, matching lighting and skin tone, no text, no watermark, no extra limbs."
                    )

                logger.info("Generating pose-matched image with Seedream using %d reference images...", len(reference_images_for_pose))

                # Parse aspect ratio to width/height
                aspect_ratios = {
                    "9:16": (1024, 1820),
                    "1:1": (1024, 1024),
                    "16:9": (1820, 1024),
                }
                pose_width, pose_height = aspect_ratios.get(request.pose_image_aspect_ratio, (1024, 1820))
                logger.info("Pose-matched image aspect ratio: %s (%dx%d)", request.pose_image_aspect_ratio, pose_width, pose_height)

                pose_matched_result = await seedream.generate(
                    prompt=pose_prompt,
                    width=pose_width,
                    height=pose_height,
                    reference_images=reference_images_for_pose,
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
            enhanced_prompt = f"Natural real-time speed movement, not slow motion. Maintain exact facial features and identity unchanged. {request.prompt}"

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
                user_id=current_user.id,
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
        # Refund tokens on early failure
        await refund_tokens(current_user, "video_generation", db)
        await db.commit()
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
    user_id: str = None,
):
    """Background task to poll for video completion and update database."""
    parrot = get_parrot_client()
    storage = get_storage_service()

    try:
        # Poll for video completion with progress updates (up to 10 minutes)
        timeout = 600
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
        # Update video record with failed status and refund tokens
        async with async_session() as db:
            video_result = await db.execute(
                select(Video).where(Video.id == video_id)
            )
            video = video_result.scalar_one_or_none()
            if video:
                video.status = DBVideoStatus.FAILED
                metadata["error"] = str(e)
                video.metadata_json = json.dumps(metadata)

            # Refund tokens on failure
            if user_id:
                from app.models.user import User as UserModel
                user_result = await db.execute(
                    select(UserModel).where(UserModel.id == user_id)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "video_generation", db, video_id)
                    logger.info(f"Refunded 2 tokens to user {user.username} for failed video {video_id}")

            await db.commit()
