"""GMI Cloud Video API client for image-to-video generation."""
import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# GMI Video API base (different from the chat/LLM API at api.gmi-serving.com)
GMI_VIDEO_BASE = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey"


class GMIVideoClient:
    """Client for GMI Cloud's Video generation REST API."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gmi_api_key
        self.model = settings.gmi_video_model
        self.queue_url = f"{GMI_VIDEO_BASE}/requests"
        self.timeout = httpx.Timeout(60.0)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def create_image_to_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 5,
    ) -> str:
        """
        Submit an image-to-video request to GMI Video API.

        Returns:
            request_id for polling status.
        """
        payload = {
            "model": self.model,
            "payload": {
                "img_url": image_url,
                "prompt": prompt,
                "duration": duration,
            },
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            logger.info(
                "GMI Video create -> url=%s model=%s prompt=%s",
                self.queue_url,
                self.model,
                prompt[:100],
            )
            response = await client.post(
                self.queue_url,
                json=payload,
                headers=self._headers(),
            )
            if response.status_code != 200:
                logger.error(
                    "GMI Video API error %s: %s",
                    response.status_code,
                    response.text[:500],
                )
                response.raise_for_status()
            result = response.json()

            request_id = result.get("request_id") or result.get("id")
            if not request_id:
                logger.error("GMI Video response missing request_id: %s", result)
                raise ValueError("GMI Video did not return a request_id")

            logger.info("GMI Video request created: %s", request_id)
            return request_id

    async def get_request_status(self, request_id: str) -> dict[str, Any]:
        """
        Poll for request status.

        Returns:
            Normalized dict with keys: status, video_url, raw
        """
        url = f"{self.queue_url}/{request_id}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            result = response.json()

        raw_status = (result.get("status") or "").lower()
        outcome = result.get("outcome") or {}

        # Video URL can be in outcome.video_url OR outcome.media_urls[0].url
        video_url = outcome.get("video_url") or outcome.get("videoUrl")
        if not video_url:
            media_urls = outcome.get("media_urls") or []
            if media_urls and isinstance(media_urls, list):
                video_url = media_urls[0].get("url") if isinstance(media_urls[0], dict) else None

        # Normalize status: dispatched/processing -> processing, success -> finished
        if raw_status in ("success", "completed", "done"):
            status = "finished"
        elif raw_status in ("failed", "error"):
            status = "failed"
        else:
            status = "processing"

        return {
            "status": status,
            "video_url": video_url,
            "thumbnail_url": outcome.get("thumbnail_image_url"),
            "raw": result,
        }


# Singleton
_gmi_video_client: Optional[GMIVideoClient] = None


def get_gmi_video_client() -> GMIVideoClient:
    """Get or create GMI Video client instance."""
    global _gmi_video_client
    if _gmi_video_client is None:
        _gmi_video_client = GMIVideoClient()
    return _gmi_video_client
