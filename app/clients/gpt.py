"""GPT-4o client for AI operations."""
from typing import Any, Optional, Union
import json
import re

from openai import AsyncOpenAI

from app.config import get_settings


class GPTClient:
    """Client for interacting with OpenAI GPT models (GPT-4o, o1-mini)."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = settings.gpt_model
        self.reasoning_model = settings.gpt_reasoning_model
        self.creative_model = settings.gpt_creative_model

    async def chat(
        self,
        messages: list[dict[str, Any]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> str:
        """Send a chat completion request."""
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens": max_tokens,  # Use max_completion_tokens for newer models
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
        return await self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )

    async def chat_reasoning(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> str:
        """
        Use reasoning model (o1-mini) for complex reasoning tasks.

        Note: o1 models do not support temperature or response_format parameters.
        """
        response = await self.client.chat.completions.create(
            model=self.reasoning_model,
            messages=messages,
            max_completion_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def chat_reasoning_json(
        self,
        messages: list[dict[str, Any]],
        max_tokens: int = 4096,
    ) -> dict[str, Any]:
        """
        Use reasoning model and parse JSON from response.

        Since o1 doesn't support response_format, we extract JSON from the response.
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
        Use creative model (gpt-4o) for creative tasks like prompt rewriting.
        """
        kwargs = {
            "model": self.creative_model,
            "messages": messages,
            "temperature": temperature,
            "max_completion_tokens": max_tokens,  # Use max_completion_tokens for newer models
        }
        if response_format:
            kwargs["response_format"] = response_format

        response = await self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content

    async def analyze_image(
        self,
        image_url: str,
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Analyze an image using GPT-4 Vision."""
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                            "detail": detail,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ]

        return await self.chat(messages=messages)

    async def compare_images(
        self,
        image_urls: list[str],
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Compare multiple images using GPT-4 Vision."""
        content = []

        for image_url in image_urls:
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": image_url,
                    "detail": detail,
                },
            })

        content.append({"type": "text", "text": prompt})

        messages = [{"role": "user", "content": content}]
        return await self.chat(messages=messages)

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

        Args:
            messages: Conversation messages
            tools: List of tool definitions in OpenAI format
            tool_choice: "auto", "none", or {"type": "function", "function": {"name": "..."}}
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response

        Returns:
            Either a string (direct response) or dict with tool_calls
        """
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=tools,
            tool_choice=tool_choice,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        message = response.choices[0].message

        # Check if there are tool calls
        if message.tool_calls:
            return {
                "content": message.content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": tc.type,
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments,
                        },
                    }
                    for tc in message.tool_calls
                ],
            }

        # Direct text response
        return message.content or ""


# Singleton instance
_gpt_client: Optional[GPTClient] = None


def get_gpt_client() -> GPTClient:
    """Get or create GPT client instance."""
    global _gpt_client
    if _gpt_client is None:
        _gpt_client = GPTClient()
    return _gpt_client
