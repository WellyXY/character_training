"""ContentBrainSkill: Autonomous content planning using DeepSeek LLM.

This skill gives the AI character a "brain" to plan high-quality content
before image/video generation — expanding vague user requests into detailed
11-section production briefs, similar to how a real creative director thinks.

Model: DeepSeek-V3 (via gmi_creative_model) for content reasoning.
"""
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.gemini import get_gemini_client


CONTENT_BRAIN_SYSTEM_PROMPT = """You are a creative director and content strategist for an AI character's social media presence.
Your job is to take a vague content request and expand it into a detailed, production-ready creative brief.

You think like a professional photographer + social media creator combined:
- You understand lighting, composition, and visual storytelling
- You know what content performs well on social platforms
- You maintain the character's visual identity and brand consistency
- You create content that feels authentic and lived-in, never staged or generic

## Output Format
Respond ONLY in valid JSON with this exact structure:
{
  "content_concept": "one-sentence creative concept",
  "scene_framing": "shot type, camera distance, composition details",
  "lighting": "light source, direction, quality, mood",
  "pose_action": "what the character is doing, body language, expression",
  "outfit": "specific clothing description with colors, fabrics, fit",
  "background": "environment, depth, key elements",
  "camera_style": "lens, depth of field, color grading",
  "mood_vibe": "overall emotional tone and atmosphere",
  "caption_suggestion": "short social media caption that fits the vibe",
  "full_prompt": "complete optimized prompt combining all elements above, ready for image generation"
}

## Key Rules
1. Always maintain character visual identity — face, hair, body proportions must be consistent with base images
2. Never be generic — every detail should feel intentional and specific
3. Match the platform vibe (Instagram = aspirational, Twitter/X = authentic/raw)
4. Lighting is everything — specify it precisely
5. full_prompt should be 150-250 words, professional photography language
"""


class ContentBrainSkill(BaseSkill):
    """Skill for autonomous content planning using DeepSeek LLM."""

    name = "content_brain"
    description = "Plan high-quality content using DeepSeek creative reasoning"

    def __init__(self):
        self.gemini_client = get_gemini_client()  # Uses DeepSeek via gmi_creative_model

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Execute content brain action."""
        if action == "plan":
            return await self._plan_content(params, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["plan"]

    async def plan_content(
        self,
        user_request: str,
        character_name: str = "",
        character_description: str = "",
        style: str = "",
        cloth: str = "",
        platform: str = "instagram",
        db: AsyncSession = None,
    ) -> dict[str, Any]:
        """
        Convenience method: plan content from a user request.

        Args:
            user_request: What the user wants (can be vague, e.g. "sexy bedroom shot")
            character_name: Character's name (for context, not used in prompts)
            character_description: Visual description of the character
            style: Style parameter (sexy, cute, warm, home, etc.)
            cloth: Clothing parameter
            platform: Target platform (instagram, twitter, onlyfans)
            db: Database session

        Returns:
            dict with content plan including full_prompt ready for image generation
        """
        result = await self._plan_content(
            {
                "user_request": user_request,
                "character_name": character_name,
                "character_description": character_description,
                "style": style,
                "cloth": cloth,
                "platform": platform,
            },
            db,
        )
        return result

    async def _plan_content(self, params: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
        """Use DeepSeek to plan content based on user request."""
        import json

        user_request = params.get("user_request", "")
        character_name = params.get("character_name", "the character")
        character_description = params.get("character_description", "")
        style = params.get("style", "")
        cloth = params.get("cloth", "")
        platform = params.get("platform", "instagram")

        # Build style/cloth context
        style_map = {
            "sexy": "sensual, confident, alluring — lingerie or revealing outfit, bold eye contact",
            "cute": "playful, sweet, youthful — cute outfit, warm smile, soft lighting",
            "warm": "cozy, intimate, natural — comfortable clothes, natural light, relaxed mood",
            "home": "casual home vibe — loungewear, relaxed pose, authentic domestic setting",
            "exposed": "artistic nude — tasteful, editorial, high-end photography style",
            "erotic": "sensual intimate content — explicit but artistic framing",
        }
        cloth_map = {
            "nude": "nude, bare skin, no clothing",
            "sexy_lingerie": "sexy lingerie — lace, silk, revealing",
            "sexy_underwear": "underwear — intimate, form-fitting",
            "home_wear": "comfortable home clothes — oversized tee, shorts, loungewear",
            "daily": "casual everyday outfit",
            "fashion": "stylish fashion outfit",
            "sports": "athletic/sportswear",
        }

        style_context = style_map.get(style, style) if style else ""
        cloth_context = cloth_map.get(cloth, cloth) if cloth else ""

        platform_notes = {
            "instagram": "Instagram: aspirational, polished, lifestyle-forward. High production value.",
            "twitter": "Twitter/X: authentic, raw, in-the-moment. Less polished, more real.",
            "onlyfans": "OnlyFans: intimate, personal, exclusive-feeling. Direct and sensual.",
        }.get(platform, "")

        messages = [
            {"role": "system", "content": CONTENT_BRAIN_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"""Plan creative content for this request:

User request: "{user_request}"

Character context:
- Name (for reference only, never use in prompts): {character_name}
- Appearance: {character_description or "use base reference images for character appearance"}
- Style: {style_context or "natural, authentic"}
- Clothing: {cloth_context or "as appropriate for the scene"}

Platform: {platform}
{platform_notes}

Generate a detailed content plan. The full_prompt must:
1. Reference "the character from base reference images" (never use names)
2. Include precise scene, lighting, pose, outfit, background, camera details
3. End with quality tags: "high quality, 4K, photorealistic, sharp focus on face"
4. Be 150-250 words
5. Match the {platform} platform aesthetic

Respond in JSON only.""",
            },
        ]

        try:
            response = await self.gemini_client.chat_creative(
                messages=messages,
                temperature=0.85,
                max_tokens=1000,
            )

            # Parse JSON response
            # Strip markdown code blocks if present
            clean = response.strip()
            if clean.startswith("```"):
                lines = clean.split("\n")
                clean = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])

            plan = json.loads(clean)
            return {
                "success": True,
                "plan": plan,
                "full_prompt": plan.get("full_prompt", ""),
                "caption": plan.get("caption_suggestion", ""),
            }

        except json.JSONDecodeError as e:
            # If JSON parsing fails, extract full_prompt from raw text
            import re
            prompt_match = re.search(r'"full_prompt"\s*:\s*"([^"]+)"', response)
            if prompt_match:
                return {
                    "success": True,
                    "plan": {"full_prompt": prompt_match.group(1)},
                    "full_prompt": prompt_match.group(1),
                    "caption": "",
                }
            return {
                "success": False,
                "error": f"Failed to parse content plan: {e}",
                "raw_response": response,
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }
