"""Sample gallery router."""
import json
import re
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import instaloader

from app.database import get_db
from app.models.sample_post import SamplePost, MediaType as DBMediaType
from app.schemas.sample_post import (
    SamplePostCreate,
    SamplePostUpdate,
    SamplePostResponse,
    MediaType,
)
from app.services.storage import get_storage_service

logger = logging.getLogger(__name__)
router = APIRouter()

def _sample_to_response(sample: SamplePost) -> SamplePostResponse:
    """Convert SamplePost model to response schema."""
    # Parse tags from JSON string
    tags = []
    if sample.tags:
        try:
            tags = json.loads(sample.tags)
        except json.JSONDecodeError:
            pass

    # Parse metadata from JSON string
    metadata = None
    if sample.metadata_json:
        try:
            metadata = json.loads(sample.metadata_json)
        except json.JSONDecodeError:
            pass

    return SamplePostResponse(
        id=sample.id,
        creator_name=sample.creator_name,
        source_url=sample.source_url,
        media_type=MediaType(sample.media_type.value),
        media_url=sample.media_url,
        thumbnail_url=sample.thumbnail_url,
        caption=sample.caption,
        tags=tags,
        metadata=metadata,
        created_at=sample.created_at,
        updated_at=sample.updated_at,
    )


@router.get("/samples", response_model=list[SamplePostResponse])
async def list_samples(
    db: AsyncSession = Depends(get_db),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    creator: Optional[str] = Query(None, description="Filter by creator name"),
    media_type: Optional[str] = Query(None, description="Filter by media type (image/video)"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all sample posts with optional filtering."""
    query = select(SamplePost).order_by(SamplePost.created_at.desc())

    # Apply filters
    if creator:
        query = query.where(SamplePost.creator_name.ilike(f"%{creator}%"))

    if media_type:
        try:
            mt = DBMediaType(media_type)
            query = query.where(SamplePost.media_type == mt)
        except ValueError:
            pass  # Ignore invalid media type

    if tag:
        # Search in JSON tags string
        query = query.where(SamplePost.tags.ilike(f"%{tag}%"))

    # Apply pagination
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    samples = result.scalars().all()

    return [_sample_to_response(sample) for sample in samples]


@router.get("/samples/{sample_id}", response_model=SamplePostResponse)
async def get_sample(
    sample_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a sample post by ID."""
    result = await db.execute(
        select(SamplePost).where(SamplePost.id == sample_id)
    )
    sample = result.scalar_one_or_none()

    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    return _sample_to_response(sample)


@router.post("/samples", response_model=SamplePostResponse)
async def create_sample(
    data: SamplePostCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new sample post (admin use)."""
    sample = SamplePost(
        creator_name=data.creator_name,
        source_url=data.source_url,
        media_type=DBMediaType(data.media_type.value),
        media_url=data.media_url,
        thumbnail_url=data.thumbnail_url,
        caption=data.caption,
        tags=json.dumps(data.tags) if data.tags else None,
        metadata_json=json.dumps(data.metadata) if data.metadata else None,
    )
    db.add(sample)
    await db.commit()
    await db.refresh(sample)

    return _sample_to_response(sample)


@router.put("/samples/{sample_id}", response_model=SamplePostResponse)
async def update_sample(
    sample_id: str,
    data: SamplePostUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a sample post."""
    result = await db.execute(
        select(SamplePost).where(SamplePost.id == sample_id)
    )
    sample = result.scalar_one_or_none()

    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    if data.creator_name is not None:
        sample.creator_name = data.creator_name
    if data.caption is not None:
        sample.caption = data.caption
    if data.tags is not None:
        sample.tags = json.dumps(data.tags)
    if data.metadata is not None:
        sample.metadata_json = json.dumps(data.metadata)

    await db.commit()
    await db.refresh(sample)

    return _sample_to_response(sample)


@router.delete("/samples/{sample_id}")
async def delete_sample(
    sample_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a sample post."""
    result = await db.execute(
        select(SamplePost).where(SamplePost.id == sample_id)
    )
    sample = result.scalar_one_or_none()

    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    await db.delete(sample)
    await db.commit()

    return {"status": "deleted"}


# ============ Upload & Import Endpoints ============

def _extract_shortcode(url: str) -> Optional[str]:
    """Extract Instagram post shortcode from URL."""
    patterns = [
        r"instagram\.com/p/([A-Za-z0-9_-]+)",
        r"instagram\.com/reel/([A-Za-z0-9_-]+)",
        r"instagram\.com/[^/]+/p/([A-Za-z0-9_-]+)",
        r"instagram\.com/[^/]+/reel/([A-Za-z0-9_-]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


@router.post("/samples/upload", response_model=SamplePostResponse)
async def upload_sample(
    file: UploadFile = File(...),
    creator_name: str = Form(default="uploaded"),
    tags: str = Form(default=""),  # comma-separated tags
    db: AsyncSession = Depends(get_db),
):
    """Upload a file (image or video) directly as a sample."""
    # Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("image/") and not content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="File must be an image or video")

    is_video = content_type.startswith("video/")
    media_type = DBMediaType.VIDEO if is_video else DBMediaType.IMAGE

    # Save file using storage service
    storage = get_storage_service()
    saved = await storage.save_upload(file, db)
    media_url = saved["url"]
    thumbnail_url = saved["url"]

    # Parse tags
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    # Create sample record
    sample = SamplePost(
        creator_name=creator_name,
        source_url="uploaded",
        media_type=media_type,
        media_url=media_url,
        thumbnail_url=thumbnail_url,
        caption=None,
        tags=json.dumps(tag_list) if tag_list else None,
        metadata_json=json.dumps({"source": "upload"}),
    )
    db.add(sample)
    await db.commit()
    await db.refresh(sample)

    return _sample_to_response(sample)


@router.post("/samples/import-url", response_model=SamplePostResponse)
async def import_from_url(
    url: str = Form(...),
    tags: str = Form(default=""),  # comma-separated tags
    db: AsyncSession = Depends(get_db),
):
    """Import a sample from Instagram URL."""
    shortcode = _extract_shortcode(url)
    if not shortcode:
        raise HTTPException(status_code=400, detail="Invalid Instagram URL")

    # Check if already exists
    result = await db.execute(
        select(SamplePost).where(SamplePost.source_url == url)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This URL has already been imported")

    # Initialize instaloader
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    try:
        post = instaloader.Post.from_shortcode(loader.context, shortcode)
    except instaloader.exceptions.LoginRequiredException:
        raise HTTPException(status_code=400, detail="This post requires login (private account)")
    except instaloader.exceptions.ProfileNotExistsException:
        raise HTTPException(status_code=400, detail="Post not found or deleted")
    except Exception as e:
        logger.error(f"Instagram fetch error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch post: {str(e)}")

    # Determine media type and URL
    is_video = post.is_video
    media_download_url = post.video_url if is_video else post.url
    media_type = DBMediaType.VIDEO if is_video else DBMediaType.IMAGE

    # Download media
    storage = get_storage_service()

    try:
        saved = await storage.save_from_url(
            media_download_url,
            db,
            prefix=f"sample_{post.owner_username}",
        )
    except Exception as e:
        logger.error(f"Failed to download media: {e}")
        raise HTTPException(status_code=500, detail="Failed to download media")

    media_url = saved["url"]
    thumbnail_url = media_url

    # For videos, try to use Instagram thumbnail URL
    if is_video and post.url:
        try:
            thumb_saved = await storage.save_from_url(
                post.url,
                db,
                prefix=f"thumb_{post.owner_username}",
            )
            thumbnail_url = thumb_saved["url"]
        except Exception as e:
            logger.warning(f"Failed to download thumbnail: {e}")

    # Parse tags
    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    # Create sample record
    sample = SamplePost(
        creator_name=post.owner_username,
        source_url=url,
        media_type=media_type,
        media_url=media_url,
        thumbnail_url=thumbnail_url,
        caption=post.caption[:1000] if post.caption else None,
        tags=json.dumps(tag_list) if tag_list else None,
        metadata_json=json.dumps({
            "likes": post.likes,
            "shortcode": shortcode,
            "post_date": post.date_utc.isoformat() if post.date_utc else None,
        }),
    )
    db.add(sample)
    await db.commit()
    await db.refresh(sample)

    return _sample_to_response(sample)
