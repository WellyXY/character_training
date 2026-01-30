"""Seedream 4.5 client for image generation."""
from typing import Any, Optional
import base64
import logging
from io import BytesIO

import httpx
from PIL import Image

from app.config import get_settings

logger = logging.getLogger(__name__)


class SeedreamClient:
    """Client for interacting with Seedream 4.5 image generation API."""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.seedream_server_url.rstrip("/")
        self.generate_path = settings.seedream_generate_path
        self.reference_path = settings.seedream_reference_path
        self.api_key = settings.seedream_api_key
        self.model = settings.seedream_model
        self.auth_header = settings.seedream_auth_header
        self.auth_scheme = settings.seedream_auth_scheme
        self.public_base_url = settings.public_base_url.rstrip("/")
        self.timeout = httpx.Timeout(300.0)  # 5 minutes for image generation
        self.watermark = settings.seedream_watermark
        if self.model and "images/generations" not in self.generate_path:
            logger.warning(
                "Seedream generate_path=%s incompatible with model; using /images/generations",
                self.generate_path,
            )
            self.generate_path = "/images/generations"
        if not self.reference_path:
            self.reference_path = self.generate_path

    def _normalize_path(self, path: str) -> str:
        if not path:
            return ""
        normalized = f"/{path.lstrip('/')}"
        base = self.base_url.rstrip("/")
        if base.endswith("/api/v3"):
            if normalized.startswith("/api/v3/"):
                normalized = normalized[len("/api/v3"):]
            elif normalized.startswith("/api/"):
                normalized = normalized[len("/api"):]
        return normalized

    def _build_url(self, path: str) -> str:
        normalized = self._normalize_path(path)
        return f"{self.base_url}{normalized}"

    def _build_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.api_key:
            if self.auth_header.lower() == "authorization":
                scheme = self.auth_scheme.strip()
                headers[self.auth_header] = f"{scheme} {self.api_key}".strip()
            else:
                headers[self.auth_header] = self.api_key
        return headers

    @staticmethod
    def bytes_to_data_url(data: bytes, content_type: str) -> str:
        mime = content_type or "image/jpeg"
        b64 = base64.b64encode(data).decode("utf-8")
        return f"data:{mime};base64,{b64}"

    async def _to_data_url(self, image_url: str) -> Optional[str]:
        if image_url.startswith("data:image/"):
            return image_url
        if image_url.startswith("/") and self.public_base_url:
            image_url = f"{self.public_base_url}{image_url}"
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
                resp = await client.get(image_url)
                resp.raise_for_status()
                image = Image.open(BytesIO(resp.content))
                if image.mode in ("RGBA", "LA", "P"):
                    background = Image.new("RGB", image.size, (255, 255, 255))
                    if image.mode == "P":
                        image = image.convert("RGBA")
                    background.paste(image, mask=image.split()[-1])
                    image = background
                elif image.mode != "RGB":
                    image = image.convert("RGB")

                buffer = BytesIO()
                image.save(buffer, format="JPEG", quality=92, optimize=True)
                b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
                return f"data:image/jpeg;base64,{b64}"
        except Exception as exc:
            logger.warning("Failed to fetch reference image url: %s (%s)", image_url, exc)
            return None

    async def _prepare_reference_images(
        self,
        reference_images: list[str],
    ) -> list[str]:
        prepared: list[str] = []
        for url in reference_images:
            data_url = await self._to_data_url(url)
            if data_url:
                prepared.append(data_url)
        return prepared

    async def generate(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 1024,
        height: int = 1024,
        steps: int = 30,
        guidance_scale: float = 7.5,
        seed: Optional[int] = None,
        reference_images: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """
        Generate an image using Seedream 4.5.

        Args:
            prompt: The text prompt for image generation
            negative_prompt: Negative prompt to avoid certain elements
            width: Image width in pixels
            height: Image height in pixels
            steps: Number of diffusion steps
            guidance_scale: CFG scale for prompt adherence
            seed: Random seed for reproducibility
            reference_images: List of image URLs for reference

        Returns:
            Dictionary with 'image_url' and 'seed' keys
        """
        use_openai_compat = bool(self.model) and "images/generations" in self.generate_path
        request_path = self.generate_path
        if reference_images and self.reference_path and self.reference_path != self.generate_path:
            # Prefer explicit reference path when it's different from generation path
            use_openai_compat = False
            request_path = self.reference_path
        if use_openai_compat:
            # OpenAI compatible endpoint requires size >= 3,686,400 pixels
            if width * height < 3686400:
                logger.info(
                    "OpenAI compatible mode upsizing from %sx%s to 2048x2048",
                    width,
                    height,
                )
                width, height = 2048, 2048
            payload = {
                "model": self.model,
                "prompt": prompt,
                "size": f"{width}x{height}",
                "n": 1,
            }
            payload["response_format"] = "url"
            payload["watermark"] = self.watermark
            if negative_prompt:
                logger.info("OpenAI compatible mode ignores negative_prompt")
            if reference_images:
                prepared = await self._prepare_reference_images(reference_images)
                if prepared:
                    payload["image"] = prepared if len(prepared) > 1 else prepared[0]
                else:
                    logger.warning(
                        "All reference images failed to load; skipping references."
                    )
        else:
            payload = {
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "steps": steps,
                "guidance_scale": guidance_scale,
                "size": f"{width}x{height}",
            }
            payload["watermark"] = self.watermark
            if seed is not None:
                payload["seed"] = seed

            # Add reference images
            if reference_images:
                prepared = await self._prepare_reference_images(reference_images)
                if prepared:
                    payload["image"] = prepared if len(prepared) > 1 else prepared[0]
                else:
                    logger.warning(
                        "All reference images failed to load; skipping references."
                    )

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            logger.info(
                "Seedream request settings: watermark=%s response_format=%s",
                self.watermark,
                payload.get("response_format"),
            )
            logger.debug(
                "Seedream request -> url=%s size=%s refs=%s",
                self._build_url(request_path),
                payload.get("size"),
                len(reference_images or []),
            )
            response = await client.post(
                self._build_url(request_path),
                json=payload,
                headers=self._build_headers(),
            )
            try:
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                body = ""
                try:
                    body = response.text
                except Exception:
                    body = "<unreadable>"
                # Log detailed error info for debugging
                logger.error(
                    "Seedream request failed status=%s body=%s",
                    response.status_code,
                    body[:2000],
                )
                # Also log the request payload for debugging (without image data)
                debug_payload = {k: v for k, v in payload.items() if k != "image"}
                if "image" in payload:
                    img_val = payload["image"]
                    if isinstance(img_val, list):
                        debug_payload["image"] = f"[{len(img_val)} images]"
                    else:
                        debug_payload["image"] = "[1 image]"
                logger.error("Seedream request payload: %s", debug_payload)
                raise exc
            data = response.json()
            if "image_url" not in data:
                try:
                    items = data.get("data") or []
                    if isinstance(items, list) and items:
                        first = items[0]
                        if isinstance(first, dict):
                            data["image_url"] = first.get("url") or first.get("image_url")
                except Exception:
                    pass
            logger.debug("Seedream response <- keys=%s", list(data.keys()))
            return data

    async def generate_with_controlnet(
        self,
        prompt: str,
        control_image_url: str,
        control_type: str = "pose",
        **kwargs,
    ) -> dict[str, Any]:
        """
        Generate an image with ControlNet guidance.

        Args:
            prompt: The text prompt for image generation
            control_image_url: URL to the control image
            control_type: Type of ControlNet (pose, depth, canny, etc.)
            **kwargs: Additional generation parameters

        Returns:
            Dictionary with 'image_url' and 'seed' keys
        """
        payload = {
            "prompt": kwargs.get("prompt", prompt),
            "negative_prompt": kwargs.get("negative_prompt", ""),
            "width": kwargs.get("width", 1024),
            "height": kwargs.get("height", 1024),
            "steps": kwargs.get("steps", 30),
            "guidance_scale": kwargs.get("guidance_scale", 7.5),
            "control_image_url": control_image_url,
            "control_type": control_type,
        }

        if kwargs.get("seed") is not None:
            payload["seed"] = kwargs["seed"]

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/generate/controlnet",
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    async def health_check(self) -> bool:
        """Check if the Seedream server is healthy."""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                response = await client.get(f"{self.base_url}/health")
                return response.status_code == 200
        except Exception:
            return False


# Singleton instance
_seedream_client: Optional[SeedreamClient] = None


def get_seedream_client() -> SeedreamClient:
    """Get or create Seedream client instance."""
    global _seedream_client
    if _seedream_client is None:
        _seedream_client = SeedreamClient()
    return _seedream_client
