"""Gemini client for AI operations."""
import base64
import json
import re
from typing import Any, Optional, Union

import httpx
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

from app.config import get_settings


class GeminiClient:
    """Client for interacting with Google Gemini models."""

    def __init__(self):
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self.model_name = settings.gemini_model
        self.vision_model_name = settings.gemini_vision_model

        # Safety settings to allow adult content (similar to GPT's permissive behavior)
        self.safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }

    def _get_model(self, model_name: Optional[str] = None) -> genai.GenerativeModel:
        """Get a GenerativeModel instance."""
        name = model_name or self.model_name
        return genai.GenerativeModel(
            model_name=name,
            safety_settings=self.safety_settings,
        )

    def _convert_messages_to_gemini_format(
        self,
        messages: list[dict[str, Any]],
    ) -> tuple[Optional[str], list[dict[str, Any]]]:
        """
        Convert OpenAI-style messages to Gemini format.

        Returns:
            Tuple of (system_instruction, history)
        """
        system_instruction = None
        history = []

        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")

            if role == "system":
                # Gemini uses system_instruction parameter instead of system role
                system_instruction = content
            elif role == "assistant":
                history.append({"role": "model", "parts": [content]})
            else:  # user
                # Handle multimodal content (text + images)
                if isinstance(content, list):
                    parts = []
                    for item in content:
                        if item.get("type") == "text":
                            parts.append(item.get("text", ""))
                        elif item.get("type") == "image_url":
                            # Will be handled separately for vision calls
                            pass
                    history.append({"role": "user", "parts": parts})
                else:
                    history.append({"role": "user", "parts": [content]})

        return system_instruction, history

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> str:
        """Send a chat completion request."""
        system_instruction, history = self._convert_messages_to_gemini_format(messages)

        model = genai.GenerativeModel(
            model_name=self.model_name,
            safety_settings=self.safety_settings,
            system_instruction=system_instruction,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=max_tokens,
            ),
        )

        # Use the last user message as the prompt
        if history:
            last_msg = history[-1]
            prompt = last_msg["parts"][0] if last_msg["parts"] else ""
            chat_history = history[:-1] if len(history) > 1 else []
        else:
            prompt = ""
            chat_history = []

        if chat_history:
            chat = model.start_chat(history=chat_history)
            response = await chat.send_message_async(prompt)
        else:
            response = await model.generate_content_async(prompt)

        return response.text

    async def chat_json(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """
        Send a chat completion request expecting JSON response.

        Note: Gemini doesn't have a native JSON mode, so we rely on prompting.
        """
        # Add JSON instruction to the last message if not already present
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
        """
        Use reasoning model for complex reasoning tasks.

        Uses the standard model with lower temperature for more deterministic output.
        Gemini 2.0 Flash has strong reasoning capabilities built-in.
        """
        return await self.chat(
            messages=messages,
            temperature=0.3,  # Lower temperature for reasoning
            max_tokens=max_tokens,
        )

    async def chat_reasoning_json(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """
        Use reasoning model and parse JSON from response.
        """
        response = await self.chat_reasoning(messages, max_tokens)

        # Try to extract JSON from the response
        try:
            # First try direct JSON parse
            return json.loads(response)
        except json.JSONDecodeError:
            # Try to find JSON in code blocks
            json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response)
            if json_match:
                return json.loads(json_match.group(1))
            # Try to find JSON object pattern
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
        """
        Use model for creative tasks like prompt rewriting.
        """
        return await self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    def _detect_mime_type(self, data: bytes, url: str = "", header_mime: str = "") -> str:
        """
        Detect the correct MIME type for image data.

        Uses magic bytes detection as primary method, falls back to URL extension.
        """
        # Check magic bytes for common image formats
        if data[:8] == b'\x89PNG\r\n\x1a\n':
            return "image/png"
        elif data[:2] == b'\xff\xd8':
            return "image/jpeg"
        elif data[:6] in (b'GIF87a', b'GIF89a'):
            return "image/gif"
        elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            return "image/webp"

        # If header mime is valid image type, use it
        if header_mime and header_mime.startswith("image/") and header_mime != "binary/octet-stream":
            return header_mime

        # Try to infer from URL extension
        url_lower = url.lower()
        if ".png" in url_lower:
            return "image/png"
        elif ".jpg" in url_lower or ".jpeg" in url_lower:
            return "image/jpeg"
        elif ".gif" in url_lower:
            return "image/gif"
        elif ".webp" in url_lower:
            return "image/webp"

        # Default to JPEG as most common
        return "image/jpeg"

    async def _load_image_data(self, image_url: str) -> tuple[bytes, str]:
        """
        Load image data from URL or data URI.

        Returns:
            Tuple of (image_bytes, mime_type)
        """
        if image_url.startswith("data:"):
            # Parse data URI: data:mime_type;base64,data
            match = re.match(r'data:([^;]+);base64,(.+)', image_url)
            if match:
                mime_type = match.group(1)
                image_data = base64.b64decode(match.group(2))
                # Verify mime type is valid for Gemini
                if mime_type == "binary/octet-stream" or not mime_type.startswith("image/"):
                    mime_type = self._detect_mime_type(image_data, image_url, mime_type)
                return image_data, mime_type
            raise ValueError("Invalid data URI format")
        else:
            # Fetch from URL
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                header_mime = response.headers.get("content-type", "")
                # Detect actual mime type from image data
                mime_type = self._detect_mime_type(response.content, image_url, header_mime)
                return response.content, mime_type

    async def analyze_image(
        self,
        image_url: str,
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Analyze an image using Gemini Vision."""
        image_data, mime_type = await self._load_image_data(image_url)

        model = genai.GenerativeModel(
            model_name=self.vision_model_name,
            safety_settings=self.safety_settings,
        )

        # Create image part for Gemini
        image_part = {
            "mime_type": mime_type,
            "data": image_data,
        }

        response = await model.generate_content_async([prompt, image_part])
        return response.text

    async def compare_images(
        self,
        image_urls: list[str],
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Compare multiple images using Gemini Vision."""
        model = genai.GenerativeModel(
            model_name=self.vision_model_name,
            safety_settings=self.safety_settings,
        )

        # Build content with multiple images
        content = [prompt]
        for image_url in image_urls:
            image_data, mime_type = await self._load_image_data(image_url)
            content.append({
                "mime_type": mime_type,
                "data": image_data,
            })

        response = await model.generate_content_async(content)
        return response.text

    async def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        tool_choice: str = "auto",
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Union[dict[str, Any], str]:
        """
        Send a chat completion request with tool definitions.

        Note: This is a simplified implementation. Gemini has native function calling
        support but with different syntax. For now, we rely on prompting.
        """
        # For simplicity, just do a regular chat and let the model decide
        # Full tool/function calling would require converting OpenAI tool format to Gemini
        response = await self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response


# Singleton instance
_gemini_client: Optional[GeminiClient] = None


def get_gemini_client() -> GeminiClient:
    """Get or create Gemini client instance."""
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = GeminiClient()
    return _gemini_client
