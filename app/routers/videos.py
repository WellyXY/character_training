"""Video management router."""
import json
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.video import Video, VideoType as DBVideoType, VideoStatus as DBVideoStatus
from app.models.image import Image
from app.models.character import Character
from app.models.user import User
from app.schemas.video import VideoResponse, VideoMetadata, VideoType, VideoStatus
from app.agent.skills.video_generator import VideoGeneratorSkill
from app.services.storage import get_storage_service
from app.auth import get_current_user
from app.services.tokens import deduct_tokens

router = APIRouter()


def _video_to_response(video: Video) -> VideoResponse:
    """Convert Video model to response schema."""
    metadata = VideoMetadata()
    if video.metadata_json:
        try:
            metadata_dict = json.loads(video.metadata_json)
            metadata = VideoMetadata(**metadata_dict)
        except (json.JSONDecodeError, TypeError):
            pass

    return VideoResponse(
        id=video.id,
        character_id=video.character_id,
        type=VideoType(video.type.value),
        video_url=video.video_url,
        thumbnail_url=video.thumbnail_url,
        duration=video.duration,
        metadata=metadata,
        status=VideoStatus(video.status.value),
        created_at=video.created_at,
    )


@router.get("/characters/{character_id}/videos", response_model=list[VideoResponse])
async def list_character_videos(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List videos for a character (must belong to current user, or any if admin)."""
    # Verify character exists and belongs to user (or admin)
    if current_user.is_admin:
        char_result = await db.execute(
            select(Character).where(Character.id == character_id)
        )
    else:
        char_result = await db.execute(
            select(Character)
            .where(Character.id == character_id)
            .where(Character.user_id == current_user.id)
        )
    if not char_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Character not found")

    result = await db.execute(
        select(Video)
        .where(Video.character_id == character_id)
        .order_by(Video.created_at.desc())
    )
    videos = result.scalars().all()

    return [_video_to_response(v) for v in videos]


@router.get("/videos/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a video by ID (character must belong to current user)."""
    result = await db.execute(
        select(Video)
        .join(Character)
        .where(Video.id == video_id)
        .where(Character.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    return _video_to_response(video)


@router.delete("/videos/{video_id}")
async def delete_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a video (character must belong to current user)."""
    result = await db.execute(
        select(Video)
        .join(Character)
        .where(Video.id == video_id)
        .where(Character.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    await db.delete(video)
    await db.commit()

    return {"status": "deleted"}


@router.post("/videos/{video_id}/retry", response_model=VideoResponse)
async def retry_video(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retry video generation (character must belong to current user, costs 2 tokens)."""
    result = await db.execute(
        select(Video)
        .join(Character)
        .where(Video.id == video_id)
        .where(Character.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Deduct tokens for retry
    await deduct_tokens(current_user, "video_generation", db, video_id)

    metadata: dict[str, Any] = {}
    if video.metadata_json:
        try:
            metadata = json.loads(video.metadata_json)
        except (json.JSONDecodeError, TypeError):
            metadata = {}

    prompt = metadata.get("prompt") or "natural movement, slight motion"
    resolution = metadata.get("resolution")

    source_image_url = metadata.get("source_image_url")
    source_image_id = metadata.get("source_image_id") or video.source_image_id
    if not source_image_url and source_image_id:
        image_result = await db.execute(
            select(Image).where(Image.id == source_image_id)
        )
        image = image_result.scalar_one_or_none()
        if image:
            storage = get_storage_service()
            source_image_url = storage.get_full_url(image.image_url)

    if not source_image_url:
        raise HTTPException(status_code=400, detail="No source image available for retry")

    skill = VideoGeneratorSkill()
    retry_result = await skill.execute(
        action="generate",
        params={
            "source_image_url": source_image_url,
            "prompt": prompt,
            "resolution": resolution,
        },
        character_id=video.character_id,
        db=db,
    )

    if not retry_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=retry_result.get("error", "Retry failed"),
        )

    new_video_id = retry_result.get("video_id")
    if not new_video_id:
        raise HTTPException(status_code=500, detail="Retry did not return video_id")

    new_result = await db.execute(
        select(Video).where(Video.id == new_video_id)
    )
    new_video = new_result.scalar_one_or_none()
    if not new_video:
        raise HTTPException(status_code=500, detail="Retry video not found")

    return _video_to_response(new_video)
