"""Edit prompt optimization skill for image editing."""
import base64
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.gpt import get_gpt_client
from app.services.storage import get_storage_service


# Seedream 4.0 Image Edit Prompt Guide
SEEDREAM_EDIT_PROMPT_GUIDE = """
You are an expert at optimizing prompts for Seedream 4.0 Image Edit.

## Seedream Image Edit Best Practices:

Image editing uses reference_images to pass the source image, and the prompt describes the desired changes.

### Edit Type Templates:

1. **ADD** - Adding elements to the image:
   `Add [element description] to [location in image]. Keep [preserved elements] unchanged.`
   Example: "Add a red rose in her hair. Keep the face, pose, and background unchanged."

2. **REMOVE** - Removing elements from the image:
   `Remove [element] from the image. Fill the area naturally with [background context].`
   Example: "Remove the sunglasses from her face. Reveal natural eyes and eyebrows."

3. **REPLACE** - Replacing one element with another:
   `Replace [original element] with [new element], keeping [preserved elements] unchanged.`
   Example: "Replace the blue dress with a red cocktail dress, keeping face and pose unchanged."

4. **BACKGROUND** - Changing the background:
   `Replace the background with [new background description], keeping the subject/person completely unchanged.`
   Example: "Replace the background with a sunset beach scene with golden hour lighting, keeping the person completely unchanged."

5. **OUTFIT** - Changing clothing:
   `Change the clothing to [new outfit description], keeping face, hairstyle, and pose unchanged.`
   Example: "Change the clothing to an elegant black evening gown with lace details, keeping face, hairstyle, and pose unchanged."

6. **STYLE** - Style transfer:
   `Transform the image into [style description] style, maintaining the subject's identity and pose.`
   Example: "Transform the image into anime illustration style, maintaining the subject's identity and pose."

7. **MODIFY** - General modifications:
   `Modify [element] to [new state/appearance], keeping [preserved elements] unchanged.`
   Example: "Modify the hair color to platinum blonde, keeping face and style unchanged."

### Key Principles:

1. **Be Specific**: Clearly describe what to change AND what to preserve
2. **Use Natural Language**: Write clear, descriptive sentences
3. **Preservation is Critical**: Always specify what should remain unchanged
4. **One Change at a Time**: Focus on one primary edit per prompt
5. **Context Matters**: Include relevant context about the scene/subject

### Output Format:
Output ONLY the optimized English prompt. No explanations or other text.
"""


IMAGE_ANALYSIS_FOR_EDIT_PROMPT = """Analyze this image to help generate an edit prompt. Focus on:

1. **Subject**: Describe the main subject (person's appearance, pose, expression)
2. **Clothing**: Current outfit details
3. **Background**: Current background/setting
4. **Lighting**: Current lighting conditions
5. **Style**: Overall visual style

The user wants to: {edit_instruction}

Based on your analysis, identify:
- What needs to be changed
- What should be preserved

Output a brief analysis in English that can help craft the edit prompt."""


class EditPromptOptimizerSkill(BaseSkill):
    """Skill for optimizing edit prompts using Seedream best practices."""

    name = "edit_prompt_optimizer"
    description = "Optimize edit prompts for image editing"

    def __init__(self):
        self.gpt_client = get_gpt_client()
        self.storage = get_storage_service()

    async def _get_image_url_or_base64(self, image_path: str, db: AsyncSession) -> str:
        """
        Convert image path to a URL that GPT-4V can access.
        For localhost URLs, convert to base64 data URI.
        """
        full_url = self.storage.get_full_url(image_path)

        if image_path.startswith("/uploads/"):
            file_id = image_path.replace("/uploads/", "")
            blob = await self.storage.get_file_blob(file_id, db)
            if blob:
                mime_type = blob.content_type or "image/jpeg"
                base64_data = base64.b64encode(blob.data).decode("utf-8")
                return f"data:{mime_type};base64,{base64_data}"

        return full_url

    def _detect_edit_type(self, instruction: str) -> str:
        """Detect edit type from user instruction."""
        instruction_lower = instruction.lower()

        # Chinese keywords mapping
        keywords = {
            "background": ["背景", "background", "場景", "環境"],
            "outfit": ["服裝", "衣服", "穿著", "outfit", "cloth", "dress", "wear"],
            "style": ["風格", "style", "轉換", "transform", "動漫", "anime", "卡通"],
            "remove": ["移除", "刪除", "去掉", "remove", "delete", "erase"],
            "add": ["添加", "加上", "新增", "add", "put", "place"],
            "replace": ["換成", "替換", "改成", "replace", "change to", "swap"],
        }

        for edit_type, kws in keywords.items():
            for kw in kws:
                if kw in instruction_lower:
                    return edit_type

        return "modify"

    async def analyze_source_image(
        self,
        image_path: str,
        edit_instruction: str,
        db: AsyncSession,
    ) -> str:
        """Use GPT-4V to analyze the source image for editing."""
        image_url = await self._get_image_url_or_base64(image_path, db)
        prompt = IMAGE_ANALYSIS_FOR_EDIT_PROMPT.format(edit_instruction=edit_instruction)

        try:
            analysis = await self.gpt_client.analyze_image(
                image_url=image_url,
                prompt=prompt,
                detail="high",
            )
            return analysis.strip()
        except Exception as e:
            # GPT may refuse NSFW content - this is expected, return empty
            print(f"Source image analysis failed (may be content policy): {e}")
            return ""

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Execute edit prompt optimization."""
        if action == "optimize":
            return await self._optimize_edit_prompt(params, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["optimize"]

    def _build_fallback_prompt(self, edit_instruction: str, edit_type: str) -> str:
        """Build a fallback prompt when GPT refuses due to content policy."""
        templates = {
            "background": f"Replace the background with {edit_instruction}. Keep the subject/person completely unchanged including face, body, pose, and expression.",
            "outfit": f"Change the clothing to {edit_instruction}. Keep face, hairstyle, pose, and body position unchanged.",
            "style": f"Transform the image style to {edit_instruction}. Maintain the subject's identity, pose, and composition.",
            "remove": f"Remove {edit_instruction} from the image. Fill the area naturally.",
            "add": f"Add {edit_instruction} to the image. Keep existing elements unchanged.",
            "replace": f"Replace with {edit_instruction}. Keep other elements unchanged.",
            "modify": f"{edit_instruction}. Keep other elements unchanged.",
        }
        return templates.get(edit_type, f"{edit_instruction}. Keep the subject unchanged.")

    async def _optimize_edit_prompt(self, params: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
        """Optimize an edit instruction for Seedream."""
        edit_instruction = params.get("edit_instruction", "")
        source_image_path = params.get("source_image_path")
        edit_type = params.get("edit_type")

        if not edit_type:
            edit_type = self._detect_edit_type(edit_instruction)

        # Analyze source image (may fail for NSFW content - that's OK)
        image_analysis = ""
        if source_image_path:
            image_analysis = await self.analyze_source_image(
                image_path=source_image_path,
                edit_instruction=edit_instruction,
                db=db,
            )

        # Build optimization prompt
        messages = [
            {"role": "system", "content": SEEDREAM_EDIT_PROMPT_GUIDE},
            {
                "role": "user",
                "content": f"""Please optimize this image edit request:

User's Edit Request: {edit_instruction}
Detected Edit Type: {edit_type}

Source Image Analysis:
{image_analysis if image_analysis else "No analysis available"}

Generate an optimized English prompt following the {edit_type.upper()} template from the guide.
Focus on clarity about what to change and what to preserve.
Output ONLY the optimized prompt.""",
            },
        ]

        try:
            optimized = await self.gpt_client.chat_creative(
                messages=messages,
                temperature=0.7,
                max_tokens=300,
            )

            # Check if GPT refused (common refusal patterns)
            refusal_indicators = [
                "i cannot", "i can't", "i'm unable", "i am unable",
                "sorry", "apologize", "not able to", "cannot assist",
                "inappropriate", "violates", "policy", "guidelines"
            ]
            optimized_lower = optimized.lower()
            if any(indicator in optimized_lower for indicator in refusal_indicators):
                # GPT refused, use fallback template
                print(f"GPT refused optimization, using fallback template")
                optimized = self._build_fallback_prompt(edit_instruction, edit_type)

            return {
                "success": True,
                "original_instruction": edit_instruction,
                "optimized_prompt": optimized.strip(),
                "edit_type": edit_type,
                "image_analysis": image_analysis,
            }
        except Exception as e:
            # If GPT completely fails, use fallback template
            print(f"GPT optimization failed: {e}, using fallback template")
            fallback_prompt = self._build_fallback_prompt(edit_instruction, edit_type)
            return {
                "success": True,  # Still return success with fallback
                "original_instruction": edit_instruction,
                "optimized_prompt": fallback_prompt,
                "edit_type": edit_type,
                "image_analysis": "",
                "used_fallback": True,
            }

    async def optimize(
        self,
        edit_instruction: str,
        source_image_path: str,
        edit_type: Optional[str] = None,
        db: AsyncSession = None,
    ) -> tuple[str, str, str]:
        """
        Convenience method to optimize an edit prompt.

        Returns:
            Tuple of (optimized_prompt, detected_edit_type, reasoning)
        """
        if db is None:
            raise ValueError("Database session is required for edit prompt optimization")
        result = await self._optimize_edit_prompt(
            {
                "edit_instruction": edit_instruction,
                "source_image_path": source_image_path,
                "edit_type": edit_type,
            },
            db,
        )

        if result["success"]:
            return (
                result["optimized_prompt"],
                result["edit_type"],
                result.get("image_analysis", ""),
            )
        else:
            # Fallback to simple prompt
            return (edit_instruction, edit_type or "modify", "")
