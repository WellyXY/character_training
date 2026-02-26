"""GMI Cloud Video API client for image-to-video generation."""
import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# GMI Video API base (different from the chat/LLM API at api.gmi-serving.com)
GMI_VIDEO_BASE = "https://console.gmicloud.ai/api/v1/ie/requestqueue/apikey"


class GMIVideoClient:
    """Client for GMI Cloud's Video generation REST API (Wan 2.6)."""

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.gmi_api_key
        self.model = settings.gmi_video_model
        self.queue_url = f"{GMI_VIDEO_BASE}/requests"
        self.timeout = httpx.Timeout(180.0)

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def create_image_to_video(
        self,
        image_url: str,
        prompt: str,
        duration: int = 8,
        resolution: str = "720P",
        aspect_ratio: Optional[str] = None,
    ) -> str:
        """
        Submit an image-to-video request to GMI Video API (Wan 2.6).

        Args:
            image_url: Public URL or base64 data URI of the source image.
            prompt: Text prompt describing desired video motion.
            duration: Not used by Wan 2.6 (kept for API compatibility).
            resolution: "720P" or "1080P".
            aspect_ratio: Not used by Wan 2.6 (auto-detected from image).

        Returns:
            request_id for polling status.
        """
        inner_payload: dict[str, Any] = {
            "img_url": image_url,
            "prompt": prompt,
            "resolution": resolution,
        }

        payload = {
            "model": self.model,
            "payload": inner_payload,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            logger.info(
                "GMI Video create -> url=%s model=%s resolution=%s prompt=%s",
                self.queue_url,
                self.model,
                resolution,
                prompt[:100],
            )
            response = await client.post(
                self.queue_url,
                json=payload,
                headers=self._headers(),
            )
            if response.status_code != 200:
                body = response.text[:500]
                logger.error("GMI Video API error %s: %s", response.status_code, body)
                if "inappropriate" in body.lower() or "content" in body.lower():
                    raise ValueError("Video model does not support NSFW content. Please use V1 or try a different image.")
                response.raise_for_status()
            result = response.json()

            request_id = result.get("request_id") or result.get("id")
            if not request_id:
                logger.error("GMI Video response missing request_id: %s", result)
                raise ValueError("GMI Video did not return a request_id")

            logger.info("GMI Video request queued: %s (status=%s)", request_id, result.get("status"))
            return request_id

    async def get_request_status(self, request_id: str) -> dict[str, Any]:
        """
        Poll for request status.

        Returns:
            Normalized dict with keys: status, video_url, thumbnail_url, raw
        """
        url = f"{self.queue_url}/{request_id}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(url, headers=self._headers())
            response.raise_for_status()
            result = response.json()

        raw_status = (result.get("status") or "").lower()
        outcome = result.get("outcome") or {}

        # Check for error in outcome
        if outcome.get("error"):
            return {
                "status": "failed",
                "video_url": None,
                "thumbnail_url": None,
                "error": outcome["error"],
                "raw": result,
            }

        # Video URL: outcome.media_urls[0].url or outcome.video_url
        video_url = outcome.get("video_url") or outcome.get("videoUrl")
        if not video_url:
            media_urls = outcome.get("media_urls") or []
            if media_urls and isinstance(media_urls, list):
                video_url = media_urls[0].get("url") if isinstance(media_urls[0], dict) else None

        # Thumbnail: thumbnail_image_url (Wan 2.6) or thumbnail_url (LTX)
        thumbnail_url = (
            outcome.get("thumbnail_image_url")
            or outcome.get("thumbnail_url")
        )

        # Normalize status
        if raw_status in ("success", "completed", "done"):
            status = "finished"
        elif raw_status in ("failed", "error"):
            status = "failed"
        else:
            status = "processing"

        return {
            "status": status,
            "video_url": video_url,
            "thumbnail_url": thumbnail_url,
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
