"""Twitter posting router using OAuth 1.0a."""
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


def get_twitter_client():
    """Get authenticated Twitter client using OAuth 1.0a."""
    # Use fresh Settings to avoid cache issues
    from app.config import Settings
    settings = Settings()

    logger.info(f"Twitter API Key: {settings.twitter_api_key}")
    logger.info(f"Twitter Access Token: {settings.twitter_access_token[:20]}...")

    if not all([
        settings.twitter_api_key,
        settings.twitter_api_secret,
        settings.twitter_access_token,
        settings.twitter_access_token_secret,
    ]):
        raise HTTPException(
            status_code=500,
            detail="Twitter API credentials not configured"
        )

    # v2 client for creating tweets
    client = tweepy.Client(
        consumer_key=settings.twitter_api_key,
        consumer_secret=settings.twitter_api_secret,
        access_token=settings.twitter_access_token,
        access_token_secret=settings.twitter_access_token_secret,
    )

    # v1.1 API for media upload
    auth = tweepy.OAuth1UserHandler(
        settings.twitter_api_key,
        settings.twitter_api_secret,
        settings.twitter_access_token,
        settings.twitter_access_token_secret,
    )
    api = tweepy.API(auth)

    return client, api


@router.get("/twitter/test")
async def test_twitter_auth():
    """Test Twitter authentication."""
    try:
        client, api = get_twitter_client()
        user = client.get_me()
        return {
            "success": True,
            "username": user.data.username,
            "user_id": user.data.id,
        }
    except HTTPException:
        raise
    except tweepy.TweepyException as e:
        logger.error(f"Twitter auth test failed: {e}")
        return {
            "success": False,
            "error": str(e),
        }


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
                logger.info(f"Media uploaded, ID: {media_id}")
            finally:
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

            file_id = video.video_url.split("/")[-1]
            blob = await storage.get_file_blob(file_id, db)

            if not blob:
                raise HTTPException(status_code=404, detail="Video file not found")

            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp.write(blob.data)
                tmp_path = tmp.name

            try:
                media = api.media_upload(
                    filename=tmp_path,
                    media_category="tweet_video"
                )
                media_id = media.media_id
                logger.info(f"Video uploaded, ID: {media_id}")
            finally:
                os.unlink(tmp_path)

        # Create tweet with media
        tweet_text = request.caption if request.caption else ""

        # Truncate caption to Twitter's 280 character limit
        if len(tweet_text) > 280:
            tweet_text = tweet_text[:277] + "..."
            logger.info(f"Caption truncated to 280 characters")

        response = client.create_tweet(
            text=tweet_text if tweet_text else None,
            media_ids=[media_id] if media_id else None
        )

        # Get tweet URL
        tweet_id = response.data["id"]
        user_response = client.get_me()
        username = user_response.data.username
        tweet_url = f"https://twitter.com/{username}/status/{tweet_id}"

        logger.info(f"Successfully posted to Twitter: {tweet_url}")

        return TwitterPostResponse(
            success=True,
            tweet_url=tweet_url
        )

    except HTTPException:
        raise
    except tweepy.TweepyException as e:
        logger.error(f"Twitter API error: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(f"Response status: {e.response.status_code}")
            logger.error(f"Response text: {e.response.text}")
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
