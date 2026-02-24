"""GMI Cloud client for AI operations (OpenAI-compatible API)."""
import base64
import json
import re
from typing import Any, Optional, Union

import httpx
from openai import AsyncOpenAI

from app.config import get_settings


class GeminiClient:
    """Client for interacting with GMI Cloud models via OpenAI-compatible API."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.gmi_api_key,
            base_url=settings.gmi_base_url,
        )
        self.model_name = settings.gmi_model
        self.vision_model_name = settings.gmi_vision_model

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> str:
        """Send a chat completion request."""
        kwargs = {
            "model": self.model_name,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = await self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    async def chat_json(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """Send a chat completion request expecting JSON response."""
        if messages and "json" not in messages[-1].get("content", "").lower():
            messages = messages.copy()
            messages[-1] = messages[-1].copy()
            content = messages[-1].get("content", "")
            messages[-1]["content"] = f"{content}\n\nRespond in valid JSON format only."

        return await self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    async def chat_reasoning(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> str:
        """Use model with lower temperature for reasoning tasks."""
        return await self.chat(
            messages=messages,
            temperature=0.3,
            max_tokens=max_tokens,
        )

    async def chat_reasoning_json(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """Use reasoning model and parse JSON from response."""
        response = await self.chat_reasoning(messages, max_tokens)

        try:
            return json.loads(response)
        except json.JSONDecodeError:
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
            if json_match:
                return json.loads(json_match.group(1))
            json_match = re.search(r'\{[\s\S]*\}', response)
            if json_match:
                return json.loads(json_match.group(0))
            raise ValueError(f"Could not parse JSON from response: {response[:500]}")

    async def chat_creative(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.9,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> str:
        """Use model for creative tasks like prompt rewriting."""
        return await self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def _detect_mime_type(self, data: bytes, url: str = "", header_mime: str = "") -> str:
        """Detect the correct MIME type for image data."""
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            return "image/png"
        elif data[:2] == b'\xff\xd8':
            return "image/jpeg"
        elif data[:6] in (b'GIF87a', b'GIF89a'):
            return "image/gif"
        elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            return "image/webp"

        if header_mime and header_mime.startswith("image/") and header_mime != "binary/octet-stream":
            return header_mime

        url_lower = url.lower()
        if ".png" in url_lower:
            return "image/png"
        elif ".jpg" in url_lower or ".jpeg" in url_lower:
            return "image/jpeg"
        elif ".gif" in url_lower:
            return "image/gif"
        elif ".webp" in url_lower:
            return "image/webp"

        return "image/jpeg"

    async def _load_image_as_data_url(self, image_url: str) -> str:
        """Load image and convert to data URL for vision API."""
        if image_url.startswith("data:"):
            return image_url

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(image_url)
            response.raise_for_status()
            mime_type = self._detect_mime_type(
                response.content, image_url, response.headers.get("content-type", "")
            )
            base64_data = base64.b64encode(response.content).decode("utf-8")
            return f"data:{mime_type};base64,{base64_data}"

    async def analyze_image(
        self,
        image_url: str,
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Analyze an image using vision model."""
        data_url = await self._load_image_as_data_url(image_url)

        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": data_url, "detail": detail},
                    },
                ],
            }
        ]

        response = await self.client.chat.completions.create(
            model=self.vision_model_name,
            messages=messages,
            max_tokens=4096,
        )
        return response.choices[0].message.content

    async def compare_images(
        self,
        image_urls: list[str],
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Compare multiple images using vision model."""
        content = [{"type": "text", "text": prompt}]

        for url in image_urls:
            data_url = await self._load_image_as_data_url(url)
            content.append({
                "type": "image_url",
                "image_url": {"url": data_url, "detail": detail},
            })

        messages = [{"role": "user", "content": content}]

        response = await self.client.chat.completions.create(
            model=self.vision_model_name,
            messages=messages,
            max_tokens=4096,
        )
        return response.choices[0].message.content

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Union[dict[str, Any], str]:
        """Send a chat completion request with tool definitions."""
        response = await self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response


# Singleton instance
_gemini_client: Optional[GeminiClient] = None


def get_gemini_client() -> GeminiClient:
    """Get or create GMI Cloud client instance."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = GeminiClient()
    return _gemini_client
