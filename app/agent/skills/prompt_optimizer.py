"""Prompt optimization skill using GPT-4o."""
import base64
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.gemini import get_gemini_client
from app.services.storage import get_storage_service


# Seedream prompt optimization guide
SEEDREAM_PROMPT_GUIDE = """
You are a professional AI image generation prompt optimization expert, specializing in optimizing prompts for the Seedream 4.5 model.

## Seedream Prompt Best Practices:

1. **Subject Description**:
   - Clearly describe the subject's appearance features
   - Include basic info such as gender, skin tone, etc.
   - **NEVER explicitly describe hairstyle or hair color** — always write "maintaining the character's exact hairstyle from images 1-3 (base images) only — do NOT copy hairstyle from image 4 (user reference image)". Hair must come exclusively from base images 1-3, not from the reference image or your own description.
   - Describe expression and pose

2. **Clothing Details**:
   - **When a reference image is provided**: describe the clothing/nudity state exactly as shown in the reference image. If the reference image shows the person nude or partially nude, write "nude" or "partially nude" accordingly. Do NOT invent clothing that is not in the reference.
   - **When NO reference image is provided**: describe clothing explicitly based on the style/cloth parameters
   - Never leave a placeholder like "[describe clothing here]" — always resolve it to a concrete description

3. **Scene Setting**:
   - Describe the environment and background
   - Include lighting, time of day, atmosphere

4. **Photography Style**:
   - Camera angle (close-up, medium shot, full body)
   - Lighting type (natural light, studio lighting, golden hour)
   - Quality descriptors (high quality, 4K, photorealistic)

5. **Style Keywords**:
   - sexy: Sensual, alluring, confident poses
   - cute: Adorable, sweet, youthful energy
   - warm: Cozy, comfortable, natural lighting
   - home: Homey, relaxed, intimate feel

## Multiple Reference Images Guide:
When both Base Images and user reference images are present, Seedream receives multiple reference images:
- Base images (first few) → Used to maintain consistent facial features and body proportions
- User reference image (last one) → Used to reference pose/composition/atmosphere/lighting

The prompt must use a special format to clearly distinguish reference targets:

**Format**:
[Reference Character] Based on the character's face and body shape from the base reference images (images 1-3),
[Reference Pose/Composition/Style] following the [specific pose/composition/atmosphere description] from the additional reference image (image 4),
generate [subject description], maintaining the character's exact hairstyle from images 1-3 only (do NOT copy hairstyle from image 4), wearing [clothing/nudity state from image 4], in [scene description]...

**Key Points**:
1. Use [Reference Character] to point to the face and body from base images (images 1-3)
2. Use [Reference Pose/Composition/Style] to point to the pose/composition/atmosphere from image 4
3. Hair MUST come from images 1-3 only — explicitly state "do NOT copy hairstyle from image 4"
4. Clothing/nudity state MUST match what is shown in image 4 (the reference image)
5. Place the vision-analyzed pose, composition, and atmosphere descriptions in the [Reference Pose...] block

## Face Consistency (CRITICAL):
- **The character's face MUST remain identical to the base reference images** — same facial features, face shape, eyes, nose, mouth, and skin texture
- **Always include face clarity instructions**: sharp focus on face, clear facial details, well-defined facial features
- Reinforce face identity every time: "maintaining exact facial features from base reference images, sharp and clear face"
- Never let background, clothing, or pose changes blur or alter the face

## Important Notes:
1. **Never use character names in the prompt**: Never put character names (e.g. "Sake II", "Luna", etc.) in the prompt, as this will cause text to be rendered onto the image
2. Only use "the character" or "the person from base reference images" to refer to the character
3. Character appearance info is only for understanding visual features, do not copy names into the prompt
4. Do not mention any person's age or birth year in the prompt
5. **Lighting and color tone**: Do NOT default to warm/golden lighting or beige tones. Only use warm tones if the user explicitly requests it. Default to neutral/natural lighting unless otherwise specified.

## Output Format:
Output the optimized English prompt directly, no other explanations needed.
"""


IMAGE_ANALYSIS_PROMPT = """Analyze this image and extract the following information for generating a similar-style image:

1. **Pose/Action**: Describe in detail the person's pose, body position, hand gestures, head angle, etc.
2. **Composition**: Describe the camera angle, framing (full body/half body/close-up), and the person's position in the frame
3. **Atmosphere/Vibe**: Overall feeling, mood, style
4. **Lighting**: Light source, direction, color temperature
5. **Scene/Background**: Environment description
6. **Clothing/Nudity State**: Describe exactly what the person is wearing. If the person is nude or partially nude, state "nude" or "topless" clearly. Do NOT skip or vague this — it is critical for prompt accuracy.

The user wants to reference: {user_intent}

Output a description in English that can be directly used as an image generation prompt. Format as follows:
- First describe the pose and action
- Then describe the composition and angle
- Then describe the atmosphere and lighting
- Finally state the clothing/nudity state explicitly (e.g., "nude", "wearing black lingerie", "topless with jeans", etc.)

Output only the description, no other explanations."""


class PromptOptimizerSkill(BaseSkill):
    """Skill for optimizing prompts using Seedream best practices."""

    name = "prompt_optimizer"
    description = "Optimize user prompts for better image generation results"

    def __init__(self):
        self.gemini_client = get_gemini_client()
        self.storage = get_storage_service()

    async def _get_image_url_or_base64(self, image_path: str, db: AsyncSession) -> str:
        """
        Convert image path to a URL that GPT-4V can access.

        For localhost URLs, convert to base64 data URI since GPT-4V can't access them.
        For remote URLs, return as-is.
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

    async def analyze_reference_image(
        self,
        image_path: str,
        user_intent: str,
        db: AsyncSession,
    ) -> str:
        """
        Use GPT-4 Vision to analyze a reference image and extract pose/composition/vibe.

        Args:
            image_path: Path to the reference image (relative URL)
            user_intent: What the user wants to reference (e.g., "reference pose", "reference atmosphere")

        Returns:
            Text description of the image that can be used in the prompt
        """
        # Convert to URL (or base64 data URI for localhost)
        image_url = await self._get_image_url_or_base64(image_path, db)

        prompt = IMAGE_ANALYSIS_PROMPT.format(user_intent=user_intent)

        try:
            analysis = await self.gemini_client.analyze_image(
                image_url=image_url,
                prompt=prompt,
                detail="high",
            )
            return analysis.strip()
        except Exception as e:
            # If analysis fails, return empty string
            print(f"Reference image analysis failed: {e}")
            return ""

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Execute prompt optimization."""
        if action == "optimize":
            return await self._optimize_prompt(params, db)
        else:
            return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["optimize"]

    def _build_fallback_prompt(
        self,
        raw_prompt: str,
        style: str = "",
        cloth: str = "",
        character_description: str = "",
        has_reference_image: bool = False,
        reference_image_mode: Optional[str] = None,
    ) -> str:
        """Build a fallback prompt when GPT refuses (for NSFW content)."""
        parts = []

        # For face_swap mode, use detailed prompt following Seedream guide
        # Image order: [user_reference (image 1), base_image_1, base_image_2, base_image_3]
        if has_reference_image and reference_image_mode == "face_swap":
            parts.append("Use the first reference image (image 1) as the main composition - keep its exact pose, body position, clothing, background, lighting, and camera angle unchanged")
            parts.append("Extract ONLY the facial features (face shape, eyes, nose, mouth, skin texture) from the subsequent reference images (images 2-4) and seamlessly blend onto the face in image 1")
            parts.append("Face replacement details: maintain the head size, angle, and expression intensity from image 1, apply facial features from images 2-4 with seamless blending at jawline, hairline, and neck, match skin tone and lighting direction")
            parts.append("Preserve from image 1: exact full-body pose, gesture, camera framing, environment, props, depth, perspective, clothing/nude state with identical coverage, fit, folds, and fabric/skin contact")
            parts.append("Photorealistic high-end editorial look, 4K detail, sharp focus on face, realistic skin shading, accurate shadows, matching lighting direction and softness, natural lens perspective, no text, no watermark, no extra limbs")
            return ". ".join(parts) + "."

        # For other modes with reference image:
        # Image order: [base_image_1, base_image_2, base_image_3, user_reference (last)]
        # Images 1-3 = base images for character face/body consistency
        # Image 4 (last) = user reference for pose/background/clothing
        if has_reference_image:
            if reference_image_mode == "pose_background":
                parts.append("Use images 1-3 (base images) for the character's face and body features to maintain identity consistency")
                parts.append("Use image 4 (last reference image) for the exact pose, body position, camera angle, background environment, and lighting")
                parts.append("Generate clothing based on the style/cloth parameters, do not copy clothing from any reference image")
            elif reference_image_mode == "clothing_pose":
                parts.append("Use images 1-3 (base images) for the character's face and body features to maintain identity consistency")
                parts.append("Use image 4 (last reference image) for the exact pose, body position, and clothing/outfit details")
                parts.append("Generate background based on the scene description")
            else:  # custom or default
                parts.append("Use images 1-3 (base images) for the character's face and body features to maintain identity consistency")
                parts.append("Use image 4 (last reference image) for pose, composition, and atmosphere reference")
        else:
            # No reference image - just use base images
            parts.append("Use the base reference images (images 1-3) for the character's face and body features")

        # Style mapping (only for non-face_swap modes)
        style_desc = {
            "sexy": "sensual and alluring pose, confident expression",
            "cute": "cute and sweet expression, playful pose",
            "warm": "warm and inviting atmosphere, soft expression",
            "home": "relaxed home setting, casual and comfortable",
            "exposed": "revealing pose, artistic nude photography style",
            "erotic": "artistic erotic photography, sensual pose, intimate atmosphere",
        }.get(style, "elegant and natural pose")
        parts.append(style_desc)

        # Cloth mapping (only for non-face_swap modes)
        cloth_desc = {
            "nude": "nude, artistic nude photography, tasteful exposure",
            "sexy_lingerie": "wearing sexy lingerie, lace details",
            "sexy_underwear": "wearing underwear, intimate apparel",
            "home_wear": "wearing comfortable home clothes",
            "daily": "wearing casual daily outfit",
            "fashion": "wearing fashionable outfit",
            "sports": "wearing athletic wear",
        }.get(cloth, "")
        if cloth_desc:
            parts.append(cloth_desc)

        # Scene from raw prompt
        if raw_prompt:
            parts.append(f"Scene: {raw_prompt}")

        # Quality tags
        parts.append("high quality, 4K, professional photography, soft studio lighting, sharp focus on face, clear and well-defined facial features, face identity consistent with reference images")

        return ", ".join(parts)

    async def _optimize_prompt(self, params: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
        """Optimize a user prompt for Seedream."""
        raw_prompt = params.get("prompt", "")
        style = params.get("style", "")
        cloth = params.get("cloth", "")
        scene = params.get("scene_description", "")
        character_description = params.get("character_description", "")
        character_gender = params.get("character_gender", "")
        reference_image_path = params.get("reference_image_path")
        reference_image_mode = params.get("reference_image_mode")
        reference_description = params.get("reference_description", "")

        # Build context for optimization
        context_parts = []

        # Add gender as explicit context - this is critical for correct prompt generation
        if character_gender:
            context_parts.append(f"Character gender: {character_gender} (IMPORTANT: The generated image MUST depict a {character_gender})")

        if character_description:
            # Remove character name from description to avoid it being rendered as text
            # Character descriptions often start with "Name: description" or just "Name, description"
            # We want only the appearance/style description, not the name
            clean_description = character_description
            # Common patterns: "Name: description", "Name - description", "Name, description"
            for separator in [": ", " - ", ", ", "：", "－"]:
                if separator in clean_description:
                    parts = clean_description.split(separator, 1)
                    if len(parts) > 1 and len(parts[0]) < 30:  # Name is usually short
                        clean_description = parts[1]
                        break
            context_parts.append(f"Character appearance: {clean_description}")
        if style:
            context_parts.append(f"Style: {style}")
        if cloth:
            context_parts.append(f"Clothing: {cloth}")
        if scene:
            context_parts.append(f"Scene: {scene}")

        # Analyze reference image if provided
        reference_context = ""
        reference_analysis = ""
        if reference_image_path:
            # Get mode-specific instructions
            mode_instructions = self._get_mode_instructions(reference_image_mode)

            # Use GPT-4 Vision to analyze the reference image
            reference_analysis = await self.analyze_reference_image(
                image_path=reference_image_path,
                user_intent=reference_description or raw_prompt,
                db=db,
            )
            if reference_analysis:
                context_parts.append(f"Reference image analysis (pose/composition/atmosphere):\n{reference_analysis}")
                context_parts.append(f"Reference mode: {reference_image_mode or 'custom'}")
                if reference_image_mode == "face_swap":
                    reference_context = f"""
6. {mode_instructions}
   - Image order sent to Seedream: [image 1 = user reference, images 2-4 = base images]
   - Your prompt MUST explicitly state this image order and what to extract from each"""
                else:
                    reference_context = f"""
6. {mode_instructions}
   - Image order sent to Seedream: [images 1-3 = base images, image 4 = user reference]
   - Your prompt MUST explicitly state this image order and what to extract from each"""
            else:
                # GPT-4V analysis failed (likely NSFW content), but still need to tell GPT about reference image
                context_parts.append("Reference image: A reference image was provided but its content could not be analyzed")
                context_parts.append(f"Reference mode: {reference_image_mode or 'custom'}")
                if reference_image_mode == "face_swap":
                    reference_context = f"""
6. {mode_instructions}
   - Image order sent to Seedream: [image 1 = user reference, images 2-4 = base images]
   - Generate prompt with explicit image order instructions based on the mode"""
                else:
                    reference_context = f"""
6. {mode_instructions}
   - Image order sent to Seedream: [images 1-3 = base images, image 4 = user reference]
   - Generate prompt with explicit image order instructions based on the mode"""

        user_context = "\n".join(context_parts) if context_parts else ""

        if reference_image_mode == "face_swap":
            instruction_header = "Generate a structured English prompt with EXPLICIT image order instructions:"
            instruction_body = (
                "1. Image order: [image 1 = user reference photo, images 2-4 = character base images]\n"
                "2. State that image 1 is the MAIN composition - keep its pose, body, clothing, background, lighting unchanged\n"
                "3. State that images 2-4 are ONLY for extracting facial features (face shape, eyes, nose, mouth, skin texture)\n"
                "4. Specify face blending: seamless blend at jawline, hairline, neck, match skin tone and lighting\n"
                "5. Add quality tags and negative prompts (no text, no watermark, no extra limbs)\n"
                "6. Keep the prompt structured (80-150 words)"
            )
        else:
            # For other modes: [images 1-3 = base images, image 4 = user reference]
            instruction_header = "Generate a detailed English prompt with EXPLICIT image order instructions:"
            instruction_body = (
                "1. Image order: [images 1-3 = character base images, image 4 = user reference photo]\n"
                "2. State that images 1-3 are for character's face and body features (identity consistency)\n"
                "3. State what to take from image 4 based on the reference mode\n"
                "4. Include scene and lighting descriptions\n"
                "5. Use professional photography terminology\n"
                "6. MUST include face emphasis: 'maintaining exact facial features from base reference images, face unchanged, sharp and clear face, well-defined facial features'\n"
                "7. Hair: write 'maintaining the character's exact hairstyle from images 1-3 (base images) only, do NOT copy or reference hairstyle from image 4' — never describe specific hair color or style\n"
                "8. Clothing: use EXACTLY the clothing/nudity state from the reference image analysis (e.g. if nude → write 'nude'; if wearing lingerie → describe that lingerie). NEVER write a placeholder.\n"
                "9. Keep the prompt at a moderate length (100-200 words)"
            )

        messages = [
            {"role": "system", "content": SEEDREAM_PROMPT_GUIDE},
            {
                "role": "user",
                "content": f"""Optimize the following generation request into a high-quality Seedream prompt:

User request: {raw_prompt}

{user_context}

{instruction_header}
{instruction_body}{reference_context}""",
            },
        ]

        try:
            optimized = await self.gemini_client.chat_creative(
                messages=messages,
                temperature=0.7,
                max_tokens=500,
            )

            # Check if model refused (content policy)
            # Use phrase-level checks only — avoid substring matches like "explicit" inside "explicitly"
            optimized_lower = optimized.lower()
            refusal_phrases = [
                "i cannot", "i can't", "i'm unable", "cannot assist",
                "can't help", "won't help", "unable to help", "not able to",
                "i apologize", "i'm sorry", "this request",
                "against my", "cannot create", "can't create",
                "not allowed to", "i must decline", "i will not",
            ]
            starts_with_refusal = optimized_lower.startswith(("i can't", "i cannot", "i'm sorry", "sorry,"))
            if any(phrase in optimized_lower for phrase in refusal_phrases) or starts_with_refusal:
                # Use fallback prompt
                print(f"GPT refused prompt optimization, using fallback")
                optimized = self._build_fallback_prompt(
                    raw_prompt, style, cloth, character_description,
                    has_reference_image=bool(reference_image_path),
                    reference_image_mode=reference_image_mode,
                )

            return {
                "success": True,
                "original_prompt": raw_prompt,
                "optimized_prompt": optimized.strip(),
                "style": style,
                "cloth": cloth,
            }
        except Exception as e:
            # Use fallback on error
            print(f"Prompt optimization failed: {e}, using fallback")
            fallback = self._build_fallback_prompt(
                raw_prompt, style, cloth, character_description,
                has_reference_image=bool(reference_image_path),
                reference_image_mode=reference_image_mode,
            )
            return {
                "success": True,
                "original_prompt": raw_prompt,
                "optimized_prompt": fallback,
                "style": style,
                "cloth": cloth,
            }

    def _get_mode_instructions(self, mode: Optional[str]) -> str:
        """Return specific prompt instructions based on reference image mode."""
        no_name_warning = "- **Strictly prohibited**: Never use any character name or age in the prompt, use 'the character' instead"
        if mode == "face_swap":
            return f"""
**Important - Face Swap Mode (face only)**:
- Reference images order: [image 1 = user reference photo, images 2-4 = character base images]
- Image 1 (user reference) is the MAIN composition: keep its exact pose, body, clothing, background, lighting, camera angle UNCHANGED
- Images 2-4 (base images) are ONLY for extracting facial features (face shape, eyes, nose, mouth, skin texture)
- The prompt must clearly instruct:
  1. Use image 1 as the main composition base
  2. Extract ONLY facial features from images 2-4
  3. Seamlessly blend the extracted face onto image 1's body
- Face blending details: maintain head size/angle/expression from image 1, blend at jawline/hairline/neck, match skin tone and lighting
- Preserve from image 1: pose, gesture, camera framing, environment, props, clothing/nude state
- Quality: 4K detail, sharp focus on face, realistic skin shading, accurate shadows
- Negative prompts: no text, no watermark, no extra limbs
{no_name_warning}
- Example: Use the first reference image (image 1) as the main composition - keep its exact pose, body position, clothing, background, lighting, and camera angle unchanged. Extract ONLY the facial features (face shape, eyes, nose, mouth, skin texture) from the subsequent reference images (images 2-4) and seamlessly blend onto the face in image 1. Face replacement details: maintain the head size, angle, and expression intensity from image 1, apply facial features from images 2-4 with seamless blending at jawline, hairline, and neck, match skin tone and lighting direction. Preserve from image 1: exact full-body pose, gesture, camera framing, environment, props, depth, perspective, clothing/nude state with identical coverage, fit, folds, and fabric/skin contact. Photorealistic high-end editorial look, 4K detail, sharp focus on face, realistic skin shading, accurate shadows, matching lighting direction and softness, natural lens perspective, no text, no watermark, no extra limbs."""
        elif mode == "pose_background":
            return f"""
**Important - Pose & Background Mode**:
- Reference images order: [images 1-3 = character base images, image 4 (last) = user reference photo]
- Images 1-3 (base images): Use for character's face and body features to maintain identity consistency
- Image 4 (user reference): Use for exact pose, body position, camera angle, background environment, and lighting
- Clothing: Generate based on user's style/cloth parameters, do NOT copy from any reference image
{no_name_warning}
- Example: Use images 1-3 (base images) for the character's face and body features to maintain identity consistency. Use image 4 (last reference image) for the exact pose, body position, camera angle, background environment, and lighting. Generate clothing based on the style/cloth parameters."""
        elif mode == "clothing_pose":
            return f"""
**Important - Clothing & Pose Mode**:
- Reference images order: [images 1-3 = character base images, image 4 (last) = user reference photo]
- Images 1-3 (base images): Use for character's face and body features to maintain identity consistency
- Image 4 (user reference): Use for exact pose, body position, and clothing/outfit details
- Background: Generate based on user's scene description
{no_name_warning}
- Example: Use images 1-3 (base images) for the character's face and body features to maintain identity consistency. Use image 4 (last reference image) for the exact pose, body position, and clothing/outfit details. Generate background based on the scene description."""
        else:  # custom or None
            return f"""
**Custom Mode**:
- Reference images order: [images 1-3 = character base images, image 4 (last) = user reference photo]
- Images 1-3 (base images): Use for character's face and body features
- Image 4 (user reference): Freely reference based on user description
{no_name_warning}
- Flexibly describe what to take from each image based on user's intent"""

    async def optimize(
        self,
        prompt: str,
        style: Optional[str] = None,
        cloth: Optional[str] = None,
        scene_description: Optional[str] = None,
        character_description: Optional[str] = None,
        character_gender: Optional[str] = None,
        reference_image_path: Optional[str] = None,
        reference_image_mode: Optional[str] = None,
        reference_description: Optional[str] = None,
        db: AsyncSession = None,
    ) -> str:
        """
        Convenience method to optimize a prompt.

        Args:
            prompt: User's raw prompt
            style: Style setting
            cloth: Clothing setting
            scene_description: Scene description
            character_description: Character description
            character_gender: Character gender (male/female)
            reference_image_path: Path to user's reference image (will be analyzed by GPT-4V)
            reference_image_mode: How to use the reference image (face_swap, pose_background, clothing_pose, custom)
            reference_description: What user wants to reference from the image

        Returns the optimized prompt string.
        """
        if db is None:
            raise ValueError("Database session is required for prompt optimization")
        result = await self._optimize_prompt(
            {
                "prompt": prompt,
                "style": style or "",
                "cloth": cloth or "",
                "scene_description": scene_description or "",
                "character_description": character_description or "",
                "character_gender": character_gender or "",
                "reference_image_path": reference_image_path,
                "reference_image_mode": reference_image_mode,
                "reference_description": reference_description or "",
            },
            db,
        )

        if result["success"]:
            return result["optimized_prompt"]
        else:
            # Fallback to original prompt if optimization fails
            return prompt
