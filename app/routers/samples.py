"""Sample gallery router."""
import json
import re
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import instaloader
import yt_dlp
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


@router.get("/samples/stats")
async def get_samples_stats(
    db: AsyncSession = Depends(get_db),
):
    """Get sample statistics including total count and tag counts."""
    result = await db.execute(select(SamplePost))
    samples = result.scalars().all()

    total = len(samples)
    image_count = sum(1 for s in samples if s.media_type == DBMediaType.IMAGE)
    video_count = sum(1 for s in samples if s.media_type == DBMediaType.VIDEO)

    # Aggregate tag counts
    tag_counts: dict[str, int] = {}
    for sample in samples:
        if sample.tags:
            try:
                tags = json.loads(sample.tags)
                for tag in tags:
                    tag_counts[tag] = tag_counts.get(tag, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass

    return {
        "total": total,
        "image_count": image_count,
        "video_count": video_count,
        "tag_counts": tag_counts,
    }


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


def _is_tiktok_url(url: str) -> bool:
    """Check if URL is a TikTok URL."""
    return bool(re.search(r"tiktok\.com/", url, re.IGNORECASE))


def _is_instagram_url(url: str) -> bool:
    """Check if URL is an Instagram URL."""
    return bool(re.search(r"instagram\.com/", url, re.IGNORECASE))


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


async def _import_from_instagram(
    url: str,
    shortcode: str,
    tags: str,
    db: AsyncSession,
) -> SamplePost:
    """Import a sample from Instagram using instaloader."""
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

    is_video = post.is_video
    media_download_url = post.video_url if is_video else post.url
    media_type = DBMediaType.VIDEO if is_video else DBMediaType.IMAGE

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

    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

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
            "source": "instagram",
        }),
    )
    return sample


async def _import_from_tiktok(
    url: str,
    tags: str,
    db: AsyncSession,
) -> SamplePost:
    """Import a sample from TikTok using yt-dlp."""
    import tempfile
    import os
    import uuid

    # Create temp directory for download
    temp_dir = tempfile.mkdtemp()
    video_id = str(uuid.uuid4())[:8]
    output_template = os.path.join(temp_dir, f"{video_id}.%(ext)s")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "outtmpl": output_template,
        "format": "best[ext=mp4]/best",  # Prefer mp4
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    except yt_dlp.utils.DownloadError as e:
        logger.error(f"TikTok fetch error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch TikTok video: {str(e)}")
    except Exception as e:
        logger.error(f"TikTok fetch error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to fetch TikTok video: {str(e)}")
    finally:
        pass  # Cleanup handled below

    if not info:
        raise HTTPException(status_code=400, detail="Could not extract video info")

    # Find downloaded file
    downloaded_file = None
    for f in os.listdir(temp_dir):
        if f.startswith(video_id):
            downloaded_file = os.path.join(temp_dir, f)
            break

    if not downloaded_file or not os.path.exists(downloaded_file):
        raise HTTPException(status_code=500, detail="Failed to download video file")

    creator_name = info.get("uploader") or info.get("channel") or "unknown"
    caption = info.get("description") or info.get("title") or ""
    thumbnail = info.get("thumbnail")

    storage = get_storage_service()

    # Upload downloaded video file
    try:
        with open(downloaded_file, "rb") as f:
            file_content = f.read()

        # Determine extension
        ext = os.path.splitext(downloaded_file)[1] or ".mp4"
        filename = f"sample_{creator_name}_{video_id}{ext}"

        saved = await storage.save_bytes(
            file_content,
            filename,
            content_type="video/mp4",
            db=db,
        )
    except Exception as e:
        logger.error(f"Failed to save TikTok video: {e}")
        raise HTTPException(status_code=500, detail="Failed to save video")
    finally:
        # Cleanup temp files
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

    media_url = saved["url"]
    thumbnail_url = media_url

    if thumbnail:
        try:
            thumb_saved = await storage.save_from_url(
                thumbnail,
                db,
                prefix=f"thumb_{creator_name}",
            )
            thumbnail_url = thumb_saved["url"]
        except Exception as e:
            logger.warning(f"Failed to download thumbnail: {e}")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()]

    sample = SamplePost(
        creator_name=creator_name,
        source_url=url,
        media_type=DBMediaType.VIDEO,
        media_url=media_url,
        thumbnail_url=thumbnail_url,
        caption=caption[:1000] if caption else None,
        tags=json.dumps(tag_list) if tag_list else None,
        metadata_json=json.dumps({
            "likes": info.get("like_count"),
            "views": info.get("view_count"),
            "video_id": info.get("id"),
            "duration": info.get("duration"),
            "source": "tiktok",
        }),
    )
    return sample


@router.post("/samples/import-url", response_model=SamplePostResponse)
async def import_from_url(
    url: str = Form(...),
    tags: str = Form(default=""),  # comma-separated tags
    db: AsyncSession = Depends(get_db),
):
    """Import a sample from Instagram or TikTok URL."""
    # Check if already exists
    result = await db.execute(
        select(SamplePost).where(SamplePost.source_url == url)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This URL has already been imported")

    # Determine platform and import
    if _is_tiktok_url(url):
        sample = await _import_from_tiktok(url, tags, db)
    elif _is_instagram_url(url):
        shortcode = _extract_shortcode(url)
        if not shortcode:
            raise HTTPException(status_code=400, detail="Invalid Instagram URL")
        sample = await _import_from_instagram(url, shortcode, tags, db)
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported URL. Please use Instagram or TikTok links."
        )

    db.add(sample)
    await db.commit()
    await db.refresh(sample)

    return _sample_to_response(sample)
