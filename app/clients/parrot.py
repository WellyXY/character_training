"""Parrot (Pika) client for video generation."""
import asyncio
import logging
from typing import Any, Optional
from pathlib import Path

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class ParrotClient:
    """Client for interacting with Parrot (Pika) video generation API."""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.parrot_api_url.strip().rstrip("/")
        self.api_key = settings.parrot_api_key
        self.timeout = httpx.Timeout(60.0)  # 60 seconds for initial request
        self.long_timeout = httpx.Timeout(300.0)  # 5 minutes for polling

    def _build_headers(self, auth_mode: str = "x-api-key") -> dict[str, str]:
        """Build request headers with API key."""
        headers: dict[str, str] = {}
        if not self.api_key:
            return headers
        mode = auth_mode.lower()
        if mode in ("authorization", "bearer"):
            headers["Authorization"] = f"Bearer {self.api_key}"
        else:
            headers["X-API-KEY"] = self.api_key
        return headers

    async def _post_with_auth_fallback(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        files: dict,
        data: dict,
        log_prefix: str,
    ) -> httpx.Response:
        """POST request with X-API-KEY, retry with Authorization if auth fails."""
        response = await client.post(
            url,
            files=files,
            data=data,
            headers=self._build_headers("x-api-key"),
        )
        try:
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            body = ""
            try:
                body = response.text
            except Exception:
                body = "<unreadable>"
            if "AUTHENTICATION_FAILED" in body and self.api_key:
                logger.warning("%s auth failed with X-API-KEY, retrying Bearer", log_prefix)
                retry = await client.post(
                    url,
                    files=files,
                    data=data,
                    headers=self._build_headers("authorization"),
                )
                retry.raise_for_status()
                return retry
            logger.error(
                "Parrot request failed status=%s body=%s",
                response.status_code,
                body[:2000],
            )
            raise exc

    async def _download_binary(self, url: str) -> bytes:
        """Download binary content from URL."""
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.content

    def _infer_audio_content_type(self, filename: str) -> str:
        lowered = filename.lower()
        if lowered.endswith(".wav"):
            return "audio/wav"
        if lowered.endswith(".m4a"):
            return "audio/mp4"
        return "audio/mpeg"

    async def create_image_to_video(
        self,
        image_source: str,  # Local file path or URL
        prompt_text: str,
        resolution: Optional[str] = None,
    ) -> str:
        """
        Create a video from an image.

        Args:
            image_source: Local image path or URL
            prompt_text: Description of desired video motion/action

        Returns:
            Video generation ID for polling
        """
        import base64

        # Prepare image data
        content_type = "image/jpeg"  # default
        if image_source.startswith("http://") or image_source.startswith("https://"):
            image_data = await self._download_binary(image_source)
            filename = "image.jpg"
        elif image_source.startswith("data:"):
            # Handle base64 data URL
            header, encoded = image_source.split(",", 1)
            image_data = base64.b64decode(encoded)
            # Extract extension from mime type
            content_type = header.split(";")[0].split(":")[1]
            ext = content_type.split("/")[1]
            filename = f"image.{ext}"
        else:
            # Local file path
            path = Path(image_source)
            image_data = path.read_bytes()
            filename = path.name
            # Infer content type from extension
            ext = path.suffix.lower()
            if ext == ".png":
                content_type = "image/png"
            elif ext in (".jpg", ".jpeg"):
                content_type = "image/jpeg"
            elif ext == ".webp":
                content_type = "image/webp"

        # Build multipart form data
        files = {
            "image": (filename, image_data, content_type),
        }
        data = {"promptText": prompt_text}
        if resolution:
            data["resolution"] = resolution

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            logger.info(
                "Parrot create_image_to_video -> url=%s prompt=%s",
                f"{self.base_url}/image-to-video-v2",
                prompt_text[:100],
            )
            response = await self._post_with_auth_fallback(
                client,
                f"{self.base_url}/image-to-video-v2",
                files=files,
                data=data,
                log_prefix="Parrot image-to-video",
            )

            result = response.json()
            video_id = result.get("id") or result.get("video_id") or result.get("jobId")
            if not video_id:
                logger.error("Parrot response missing video ID: %s", result)
                raise ValueError("Parrot did not return a video ID")

            logger.info("Parrot job created: %s", video_id)
            return video_id

    async def create_audio_to_video(
        self,
        image_source: str,
        audio_source: str,
        prompt_text: str,
    ) -> str:
        """
        Create a video from an image and audio input.

        Args:
            image_source: Local image path or URL
            audio_source: Local audio path or URL
            prompt_text: Description of desired video motion/action

        Returns:
            Video generation ID for polling
        """
        import base64

        # Prepare image data
        if image_source.startswith("http://") or image_source.startswith("https://"):
            image_data = await self._download_binary(image_source)
            image_filename = "image.jpg"
        elif image_source.startswith("data:"):
            header, encoded = image_source.split(",", 1)
            image_data = base64.b64decode(encoded)
            mime_type = header.split(";")[0].split(":")[1]
            ext = mime_type.split("/")[1]
            image_filename = f"image.{ext}"
        else:
            path = Path(image_source)
            image_data = path.read_bytes()
            image_filename = path.name

        # Prepare audio data
        if audio_source.startswith("http://") or audio_source.startswith("https://"):
            audio_data = await self._download_binary(audio_source)
            audio_filename = Path(audio_source).name or "audio.mp3"
        elif audio_source.startswith("data:"):
            header, encoded = audio_source.split(",", 1)
            audio_data = base64.b64decode(encoded)
            mime_type = header.split(";")[0].split(":")[1]
            ext = mime_type.split("/")[1]
            audio_filename = f"audio.{ext}"
        else:
            path = Path(audio_source)
            audio_data = path.read_bytes()
            audio_filename = path.name

        files = {
            "image": (image_filename, image_data, "image/jpeg"),
            "audio": (audio_filename, audio_data, self._infer_audio_content_type(audio_filename)),
        }
        data = {"promptText": prompt_text}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            logger.info(
                "Parrot create_audio_to_video -> url=%s prompt=%s",
                f"{self.base_url}/audio-to-video",
                prompt_text[:100],
            )
            response = await self._post_with_auth_fallback(
                client,
                f"{self.base_url}/audio-to-video",
                files=files,
                data=data,
                log_prefix="Parrot audio-to-video",
            )

            result = response.json()
            video_id = result.get("id") or result.get("video_id") or result.get("jobId")
            if not video_id:
                logger.error("Parrot response missing video ID: %s", result)
                raise ValueError("Parrot did not return a video ID")

            logger.info("Parrot job created: %s", video_id)
            return video_id

    async def get_video_status(self, video_id: str) -> dict[str, Any]:
        """
        Get the status of a video generation job.

        Args:
            video_id: The video generation ID

        Returns:
            Dictionary with status and video_url (when complete)
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.base_url}/videos/{video_id}",
                headers=self._build_headers(),
            )
            response.raise_for_status()
            result = response.json()

            # Normalize response format
            status = result.get("status", "unknown")
            video_url = result.get("video_url") or result.get("videoUrl") or result.get("url")

            return {
                "status": status,
                "video_url": video_url,
                "thumbnail_url": result.get("thumbnail_url") or result.get("thumbnailUrl"),
                "duration": result.get("duration"),
                "raw": result,
            }

    async def wait_for_video(
        self,
        video_id: str,
        timeout: int = 300,
        poll_interval: int = 5,
    ) -> dict[str, Any]:
        """
        Poll for video completion.

        Args:
            video_id: The video generation ID
            timeout: Maximum time to wait in seconds
            poll_interval: Time between polls in seconds

        Returns:
            Dictionary with video_url and other metadata

        Raises:
            TimeoutError: If video generation times out
            ValueError: If video generation fails
        """
        elapsed = 0
        last_status = None

        while elapsed < timeout:
            result = await self.get_video_status(video_id)
            status = result.get("status", "").lower()

            if status != last_status:
                logger.info("Parrot video %s status: %s", video_id, status)
                last_status = status

            if status in ("finished", "completed", "done", "success"):
                if result.get("video_url"):
                    return result
                else:
                    logger.warning("Video completed but no URL: %s", result)

            if status in ("failed", "error"):
                raw = result.get("raw", {})
                error_msg = raw.get("error") or raw.get("message") or raw.get("errorMessage") or str(raw)
                logger.error("Parrot video failed: status=%s raw=%s", status, raw)
                raise ValueError(f"Video generation failed: {error_msg}")

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        raise TimeoutError(f"Video generation timed out after {timeout} seconds")

    async def health_check(self) -> bool:
        """Check if the Parrot server is available."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                response = await client.get(
                    f"{self.base_url}/health",
                    headers=self._build_headers(),
                )
                return response.status_code == 200
        except Exception:
            return False


# Singleton instance
_parrot_client: Optional[ParrotClient] = None


def get_parrot_client() -> ParrotClient:
    """Get or create Parrot client instance."""
    global _parrot_client
    if _parrot_client is None:
        _parrot_client = ParrotClient()
    return _parrot_client
