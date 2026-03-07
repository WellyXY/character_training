"""Instagram caption generation service."""
import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)

_LANGS = ["English", "Korean"]


async def generate_ins_caption(
    character_name: str,
    character_description: str,
    prompt: str,
    content_type: str = "image",  # "image" or "video"
    image_url: Optional[str] = None,  # full URL to the generated image
) -> str:
    """Generate a short Instagram caption using Grok.

    If image_url is provided, uses Grok Vision to analyze the actual image.
    Otherwise falls back to text-based generation from the prompt.
    Randomly picks English or Korean.
    """
    from app.clients.gemini import GeminiClient

    # Mostly English, occasionally mix in some Korean words/phrases
    mix_korean = random.random() < 0.3  # 30% chance to sprinkle Korean
    lang_instruction = (
        "Write in English, but naturally mix in a few Korean words or a short Korean phrase"
        if mix_korean
        else "Write in English"
    )

    client = GeminiClient()
    persona = (character_description or "").strip()[:200]

    if image_url:
        # Vision path: let Grok actually see the image
        vision_prompt = (
            f"Character name: {character_name}\n"
            f"Persona: {persona}\n\n"
            f"Look at this {content_type} and write a short Instagram caption "
            f"as this character posting it to their Instagram. "
            f"{lang_instruction}. "
            f"1-2 sentences only (under 120 characters). "
            f"Add 2-3 relevant hashtags at the end. "
            f"Sound authentic and natural, not marketing-speak. "
            f"Output only the caption text, no quotes or explanation."
        )
        caption = await client.analyze_image_grok(
            image_url=image_url,
            prompt=vision_prompt,
        )
    else:
        # Text fallback: use prompt description
        prompt_snippet = (prompt or "").strip()[:150]
        user_msg = (
            f"Character name: {character_name}\n"
            f"Persona: {persona}\n"
            f"Content description: {prompt_snippet}\n"
            f"Content type: {content_type}\n\n"
            f"Write a short Instagram caption as this character. "
            f"{lang_instruction}. "
            f"1-2 sentences only (under 120 characters). "
            f"Add 2-3 relevant hashtags at the end. "
            f"Sound authentic and natural, not marketing-speak. "
            f"Output only the caption text, no quotes or explanation."
        )
        caption = await client.chat_grok(
            messages=[
                {"role": "system", "content": "You write short, authentic Instagram captions for social media influencers."},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.9,
            max_tokens=120,
        )

    return caption.strip()
