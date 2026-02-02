"""Twitter API client using OAuth 1.0a for media uploads and tweets."""
import base64
import hashlib
import hmac
import logging
import secrets
import time
import urllib.parse
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class TwitterClient:
    """Client for interacting with Twitter API v2 with OAuth 1.0a authentication."""

    UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json"
    TWEET_URL = "https://api.twitter.com/2/tweets"

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.twitter_api_key
        self.api_secret = settings.twitter_api_secret
        self.access_token = settings.twitter_access_token
        self.access_token_secret = settings.twitter_access_token_secret
        self.public_base_url = settings.public_base_url.strip().rstrip("/")
        self.timeout = httpx.Timeout(60.0)

    def is_configured(self) -> bool:
        """Check if all required credentials are configured."""
        return all([
            self.api_key,
            self.api_secret,
            self.access_token,
            self.access_token_secret,
        ])

    def _generate_oauth_signature(
        self,
        method: str,
        url: str,
        oauth_params: dict[str, str],
        body_params: Optional[dict[str, str]] = None,
    ) -> str:
        """Generate OAuth 1.0a signature."""
        all_params = {**oauth_params}
        if body_params:
            all_params.update(body_params)

        sorted_params = sorted(all_params.items())
        param_string = "&".join(
            f"{urllib.parse.quote(k, safe='')}"
            f"={urllib.parse.quote(str(v), safe='')}"
            for k, v in sorted_params
        )

        base_string = "&".join([
            method.upper(),
            urllib.parse.quote(url, safe=""),
            urllib.parse.quote(param_string, safe=""),
        ])

        signing_key = "&".join([
            urllib.parse.quote(self.api_secret, safe=""),
            urllib.parse.quote(self.access_token_secret, safe=""),
        ])

        signature = hmac.new(
            signing_key.encode("utf-8"),
            base_string.encode("utf-8"),
            hashlib.sha1,
        ).digest()

        return base64.b64encode(signature).decode("utf-8")

    def _build_oauth_header(
        self,
        method: str,
        url: str,
        body_params: Optional[dict[str, str]] = None,
    ) -> str:
        """Build OAuth 1.0a Authorization header."""
        oauth_params = {
            "oauth_consumer_key": self.api_key,
            "oauth_nonce": secrets.token_hex(16),
            "oauth_signature_method": "HMAC-SHA1",
            "oauth_timestamp": str(int(time.time())),
            "oauth_token": self.access_token,
            "oauth_version": "1.0",
        }

        signature = self._generate_oauth_signature(
            method, url, oauth_params, body_params
        )
        oauth_params["oauth_signature"] = signature

        header_parts = [
            f'{urllib.parse.quote(k, safe="")}="{urllib.parse.quote(v, safe="")}"'
            for k, v in sorted(oauth_params.items())
        ]

        return "OAuth " + ", ".join(header_parts)

    async def _fetch_image_bytes(self, image_url: str) -> tuple[bytes, str]:
        """Fetch image data from URL or local path."""
        if image_url.startswith("/") and self.public_base_url:
            image_url = f"{self.public_base_url}{image_url}"

        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "image/jpeg")
            return resp.content, content_type

    async def upload_media(self, image_url: str) -> dict[str, Any]:
        """
        Upload media to Twitter using chunked upload for images.

        Args:
            image_url: URL or path to the image

        Returns:
            Dictionary with 'media_id' and 'media_id_string'
        """
        if not self.is_configured():
            raise ValueError("Twitter API credentials not configured")

        image_data, content_type = await self._fetch_image_bytes(image_url)
        image_b64 = base64.b64encode(image_data).decode("utf-8")

        body_params = {
            "media_data": image_b64,
            "media_category": "tweet_image",
        }

        auth_header = self._build_oauth_header("POST", self.UPLOAD_URL, body_params)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                self.UPLOAD_URL,
                data=body_params,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )

            if response.status_code == 401:
                logger.error("Twitter auth failed: %s", response.text)
                raise ValueError("Twitter authentication failed. Check API credentials.")
            if response.status_code == 403:
                logger.error("Twitter forbidden: %s", response.text)
                raise ValueError("Twitter access forbidden. Check app permissions.")
            if response.status_code == 429:
                retry_after = response.headers.get("retry-after", "unknown")
                raise ValueError(f"Twitter rate limit exceeded. Retry after {retry_after} seconds.")

            response.raise_for_status()
            result = response.json()
            logger.info("Twitter media uploaded: media_id=%s", result.get("media_id_string"))
            return result

    async def create_tweet(
        self,
        text: str,
        media_ids: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Create a tweet with optional media.

        Args:
            text: Tweet text (max 280 characters)
            media_ids: List of media IDs to attach

        Returns:
            Dictionary with tweet data including 'id'
        """
        if not self.is_configured():
            raise ValueError("Twitter API credentials not configured")

        if len(text) > 280:
            raise ValueError(f"Tweet text exceeds 280 characters ({len(text)})")

        payload: dict[str, Any] = {"text": text}
        if media_ids:
            payload["media"] = {"media_ids": media_ids}

        auth_header = self._build_oauth_header("POST", self.TWEET_URL)

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                self.TWEET_URL,
                json=payload,
                headers={
                    "Authorization": auth_header,
                    "Content-Type": "application/json",
                },
            )

            if response.status_code == 401:
                logger.error("Twitter auth failed: %s", response.text)
                raise ValueError("Twitter authentication failed. Check API credentials.")
            if response.status_code == 403:
                logger.error("Twitter forbidden: %s", response.text)
                raise ValueError("Twitter access forbidden. Check app permissions.")
            if response.status_code == 429:
                retry_after = response.headers.get("retry-after", "unknown")
                raise ValueError(f"Twitter rate limit exceeded. Retry after {retry_after} seconds.")

            response.raise_for_status()
            result = response.json()
            tweet_id = result.get("data", {}).get("id")
            logger.info("Tweet created: id=%s", tweet_id)
            return result

    async def post_image_with_caption(
        self,
        image_url: str,
        caption: str,
    ) -> dict[str, Any]:
        """
        Upload image and post a tweet with caption.

        Args:
            image_url: URL or path to the image
            caption: Tweet text (max 280 characters)

        Returns:
            Dictionary with 'tweet_id' and 'tweet_url'
        """
        media_result = await self.upload_media(image_url)
        media_id = media_result.get("media_id_string")

        if not media_id:
            raise ValueError("Failed to get media_id from upload")

        tweet_result = await self.create_tweet(caption, [media_id])
        tweet_id = tweet_result.get("data", {}).get("id")

        if not tweet_id:
            raise ValueError("Failed to get tweet_id from response")

        tweet_url = f"https://twitter.com/i/status/{tweet_id}"

        return {
            "tweet_id": tweet_id,
            "tweet_url": tweet_url,
            "media_id": media_id,
        }


_twitter_client: Optional[TwitterClient] = None


def get_twitter_client() -> TwitterClient:
    """Get or create Twitter client instance."""
    global _twitter_client
    if _twitter_client is None:
        _twitter_client = TwitterClient()
    return _twitter_client
