"""Instagram caption generation service."""
import logging
import random

logger = logging.getLogger(__name__)

_LANGS = ["English", "Korean"]


async def generate_ins_caption(
    character_name: str,
    character_description: str,
    prompt: str,
    content_type: str = "image",  # "image" or "video"
) -> str:
    """Generate a short Instagram caption using Grok.

    Randomly picks English or Korean. Returns caption with 2-3 hashtags.
    """
    from app.clients.gemini import GeminiClient

    lang = random.choice(_LANGS)
    client = GeminiClient()

    persona = (character_description or "").strip()[:200]
    prompt_snippet = (prompt or "").strip()[:150]

    user_msg = (
        f"Character name: {character_name}\n"
        f"Persona: {persona}\n"
        f"Content description: {prompt_snippet}\n"
        f"Content type: {content_type}\n\n"
        f"Write a short Instagram caption in {lang} as this character. "
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
