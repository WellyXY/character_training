"""Twitter posting router."""
import tempfile
import logging
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import tweepy

from app.config import get_settings
from app.database import get_db
from app.models.image import Image
from app.models.video import Video
from app.services.storage import get_storage_service

logger = logging.getLogger(__name__)

router = APIRouter()


class TwitterPostRequest(BaseModel):
    """Request model for posting to Twitter."""
    image_id: Optional[str] = None
    video_id: Optional[str] = None
    caption: str = ""


class TwitterPostResponse(BaseModel):
    """Response model for Twitter post."""
    success: bool
    tweet_url: Optional[str] = None
    error: Optional[str] = None


def get_twitter_credentials() -> dict:
    """Get Twitter API credentials from settings."""
    settings = get_settings()
    return {
        "api_key": settings.twitter_api_key,
        "api_secret": settings.twitter_api_secret,
        "access_token": settings.twitter_access_token,
        "access_token_secret": settings.twitter_access_token_secret,
    }


def get_twitter_client():
    """Get authenticated Twitter client."""
    creds = get_twitter_credentials()

    if not all(creds.values()):
        raise HTTPException(
            status_code=500,
            detail="Twitter API credentials not configured"
        )

    # v2 client for creating tweets
    client = tweepy.Client(
        consumer_key=creds["api_key"],
        consumer_secret=creds["api_secret"],
        access_token=creds["access_token"],
        access_token_secret=creds["access_token_secret"],
    )

    # v1.1 API for media upload (required for images/videos)
    auth = tweepy.OAuth1UserHandler(
        creds["api_key"],
        creds["api_secret"],
        creds["access_token"],
        creds["access_token_secret"],
    )
    api = tweepy.API(auth)

    return client, api


@router.post("/twitter/post", response_model=TwitterPostResponse)
async def post_to_twitter(
    request: TwitterPostRequest,
    db: AsyncSession = Depends(get_db),
):
    """Post image or video to Twitter."""

    if not request.image_id and not request.video_id:
        raise HTTPException(
            status_code=400,
            detail="Either image_id or video_id is required"
        )

    try:
        client, api = get_twitter_client()
        storage = get_storage_service()

        media_id = None

        if request.image_id:
            # Get image from database
            result = await db.execute(
                select(Image).where(Image.id == request.image_id)
            )
            image = result.scalar_one_or_none()

            if not image:
                raise HTTPException(status_code=404, detail="Image not found")

            if not image.image_url:
                raise HTTPException(status_code=400, detail="Image URL not available")

            # Get the file blob from storage
            # Extract file_id from URL like "/uploads/{file_id}"
            file_id = image.image_url.split("/")[-1]
            blob = await storage.get_file_blob(file_id, db)

            if not blob:
                raise HTTPException(status_code=404, detail="Image file not found")

            # Save to temp file for upload
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                tmp.write(blob.data)
                tmp_path = tmp.name

            try:
                # Upload media to Twitter
                media = api.media_upload(filename=tmp_path)
                media_id = media.media_id
            finally:
                # Clean up temp file
                os.unlink(tmp_path)

        elif request.video_id:
            # Get video from database
            result = await db.execute(
                select(Video).where(Video.id == request.video_id)
            )
            video = result.scalar_one_or_none()

            if not video:
                raise HTTPException(status_code=404, detail="Video not found")

            if not video.video_url:
                raise HTTPException(status_code=400, detail="Video URL not available")

            # Get the file blob from storage
            file_id = video.video_url.split("/")[-1]
            blob = await storage.get_file_blob(file_id, db)

            if not blob:
                raise HTTPException(status_code=404, detail="Video file not found")

            # Save to temp file for upload
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp.write(blob.data)
                tmp_path = tmp.name

            try:
                # Upload video to Twitter (chunked upload for videos)
                media = api.media_upload(
                    filename=tmp_path,
                    media_category="tweet_video"
                )
                media_id = media.media_id
            finally:
                # Clean up temp file
                os.unlink(tmp_path)

        # Create tweet with media
        tweet_text = request.caption if request.caption else ""

        response = client.create_tweet(
            text=tweet_text,
            media_ids=[media_id] if media_id else None
        )

        # Get tweet URL
        tweet_id = response.data["id"]
        # Get authenticated user's username for the URL
        user_response = client.get_me()
        username = user_response.data.username
        tweet_url = f"https://twitter.com/{username}/status/{tweet_id}"

        logger.info(f"Successfully posted to Twitter: {tweet_url}")

        return TwitterPostResponse(
            success=True,
            tweet_url=tweet_url
        )

    except tweepy.TweepyException as e:
        logger.error(f"Twitter API error: {e}")
        return TwitterPostResponse(
            success=False,
            error=str(e)
        )
    except Exception as e:
        logger.error(f"Error posting to Twitter: {e}")
        return TwitterPostResponse(
            success=False,
            error=str(e)
        )
