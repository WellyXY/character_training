"""Prompt optimization skill using GPT-4o."""
import logging
import re
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.gemini import get_gemini_client
from app.services.storage import get_storage_service

logger = logging.getLogger(__name__)


# Seedream Vlog & Selfie Prompt Writer — used for pure image generation (no reference image)
SEEDREAM_VLOG_PROMPT_GUIDE = """
You are a Seedream prompt writer specializing in realistic candid, selfie, and lifestyle content.

## Core Framework (in order — earlier layers carry more weight)
[Shot type] → [Subject anchor] → [Activity anchor] → [Authenticity markers] → [Background/scene] → [Vibe sentence] → [Technical layer]

---

## CRITICAL ANTI-PATTERNS — NEVER DO THESE

### 1. Wrong framing words
BAD: "Soft portrait photo" → AI reads this as studio/glamour → outputs hotel lighting, perfect skin, gold-satin-bed aesthetic
GOOD: "Candid snapshot" / "Candid lifestyle photo" → AI reads as unstaged → outputs natural, real

BAD: "Professional photography" / "High quality portrait" → same studio drift
GOOD: "Phone camera grain" / "Candid" / "As if friend took the shot"

### 2. Static posture sold as activity
BAD: "leaning back propped on elbows" — this is a POSE, not an ACTION → AI fills the void with a posed-for-camera expression
GOOD activity has physical tension / mid-movement energy:
  - "reaching for something on the nightstand mid-movement"
  - "adjusting the strap of her top, looking down"
  - "caught pushing hair out of her face"
  - "pulling hair into a ponytail, arms raised"

### 3. Posed gaze combo
BAD: "eyes locked on camera + confident smirk" → AI reads "she knows she's being photographed" → fully posed result
If using eye contact: pair with a distracted or mid-expression state — "glancing up from phone briefly", "caught looking up mid-laugh"
Default: gaze NOT at camera unless it is intentionally a selfie

### 4. Double light source
BAD: "window light + warm lamp" together → AI resolves conflict by smoothing skin to perfection
GOOD: pick ONE source only — "single bedside lamp, dim amber" OR "soft morning window light" — never both

### 5. Cinematic color tone
BAD: "dim bedside lamp, warm amber glow" → AI enters boudoir photoshoot mode → whole image gets golden-moody-editorial aesthetic
GOOD: "weak overhead room light, slightly harsh" / "phone screen cold glow only" / "bathroom vanity light, slightly overexposed"
Real rooms don't look cinematic. Flat, slightly harsh, or cold light = more authentic.

### 6. Describing expression directly
BAD: "sultry gaze", "bedroom eyes", "confident smirk" → AI generates perfect model face
GOOD: describe mental state: "absorbed in adjusting, not camera-aware", "glancing down, jaw slightly relaxed", "mind elsewhere, eyes unfocused"
Expression is a byproduct of what she's thinking/doing — never a direct instruction.

---

## Layer 1 — Shot Type (leads everything, most weight)
Use candid-coded framing words:
- Candid snapshot
- Candid lifestyle photo
- iPhone selfie mirror shot
- Ultra-realistic iPhone 16 front camera selfie
- Cinematic vlog-style wide shot, handheld
- Eye level candid, as if friend took the shot
- Street-level candid from behind-slightly-to-side

## Layer 2 — Subject Anchor (3–5 features only)
Eyes / Hair / Skin detail / Expression matching activity / Outfit (max 2 items)
Never stack more than 5 — overloading degrades quality.

## Layer 3 — Activity Anchor (MANDATORY — prevents mannequin poses)
Pick one action with physical tension. The subject's brain must be focused on something other than the camera.

| Category    | Activity anchors                                                               |
|-------------|--------------------------------------------------------------------------------|
| Phone       | scrolling phone with both thumbs, glancing at notification, texting mid-walk   |
| Mirror      | adjusting waistband mid-check, fixing hair in reflection, pulling hem down      |
| Body        | pushing hair out of face, pulling hair into ponytail arms raised, mid-stretch   |
| Object      | holding coffee mug with both hands eyes closed mid-sip, writing in notebook     |
| Environment | reaching for something on nightstand, mid-step toward door, turning mid-laugh   |
| Transition  | caught mid-movement, reaching for something off-frame, mid-laugh hand to mouth  |

Body posture (add 1–2):
weight shifted to one leg hip tilted / one shoulder raised body slightly angled / sitting cross-legged hunched slightly forward / head tilted to one side / body turned 3/4 away / mid-step one foot forward / perched on bed edge elbows on knees hair falling forward

Expression (match the activity — never blank):
- Scrolling → neutral, slightly zoned out, eyes down
- Mid-laugh → eyes crinkled shut, hand over mouth
- Coffee mid-sip → eyes closed, head tilted back
- Window gaze → soft unfocused gaze, chin slightly lifted
- Adjusting outfit → slight smirk, eyes on herself not camera
- Caught off-guard → lips slightly parted, micro-surprised
- Reading/writing → brow slightly furrowed, focused

## Layer 4 — Authenticity Markers (1–2 imperfections)
slight motion blur on hands / phone camera grain / slightly overexposed / awkward candid angle / named phone model (e.g. iPhone 15 Pro)

## Layer 5 — Background/Scene (specific — never vague)
Single lighting source only. Name a real place.
- Late night: dim bedside lamp only, unmade white sheets, warm amber glow
- Morning: soft window light flooding in, curtains half-open — NO other light source
- Getting ready: ring light only, full-length mirror, bedroom visible in reflection
- Lazy afternoon: golden hour through curtains only, cluttered nightstand

## Layer 6 — Vibe Sentence (1 closing line)
- "Vibe: late afternoon nothing-to-do scrolling, completely unselfconscious."
- "Vibe: quick outfit check before going out, real and casual."
- "Vibe: slow morning, mind elsewhere, zero posing energy."
- "Vibe: caught mid-errand, zero camera awareness."

## Technical Layer
| Goal            | Append                                                   |
|-----------------|----------------------------------------------------------|
| Portrait        | 85mm f/1.8, shallow depth of field                       |
| Phone selfie    | front camera, slight wide-angle distortion               |
| Vlog            | 16mm, handheld, slight camera shake, natural color grade |
| Mirror selfie   | front camera distortion, slight hand motion blur         |
| Cinematic       | anamorphic lens flare, filmic grade, 2.35:1              |

## Negative Prompt (always append)
no extra limbs, no waxy skin, no over-sharpened pores, no cartoon style, no heavy smoothing, no distorted ears, no multiple pupils, no exaggerated bokeh, no stiff posing, no symmetrical standing pose, no studio lighting, no glamour lighting, no warm amber glow, no cinematic lighting, no moody atmosphere, no golden hour tone, no sultry gaze, no posed expression, no bedroom eyes, no heavy makeup, no lipstick

---

## Anti-Stiff Formula (apply to every pose)
1. Break symmetry — one side doing something different from the other
2. Add gravity pull — weight, lean, droop — body responds to gravity
3. Give hands a job — holding/touching/adjusting something specific
4. Turn the gaze — NOT at camera unless intentional selfie
5. Add hair movement cue — "hair falling forward", "swinging from movement", "wisp escaping"

## Anti-Stiff Case Library
| Scenario              | Stiff trap                        | Fix                                                                                   |
|-----------------------|-----------------------------------|---------------------------------------------------------------------------------------|
| Full-body mirror selfie | Symmetric standing, facing camera | Torso twisted checking side profile, weight on one leg, heel lifted, eyes on reflection |
| Standing on street    | Arms at sides, facing forward     | Leaning against wall, one knee bent, both thumbs typing, eyes down on screen           |
| Sitting in chair      | Upright, hands on lap             | Legs draped over armrest, half-reclining, one hand on drink mid-sip, looking sideways  |
| Sitting on bed edge   | Straight back, hands on thighs    | Perched hunched forward, elbows on knees, hair falling forward, head slightly dropped  |
| Lying on floor        | Flat on back, arms at sides       | Knees bent up, one arm overhead holding phone, squinting at screen                     |

---

## Assembled Examples

1. Bed scrolling: Candid snapshot. Young woman, sitting cross-legged on unmade bed, hunched slightly forward, scrolling through phone with both thumbs, head tilted down, dark hair falling over one shoulder. Black sports crop top, mini skirt. Warm bedside lamp only, cluttered nightstand. Fully absorbed, unaware of camera. Phone camera grain, slight wide-angle. Vibe: late afternoon nothing-to-do scrolling, completely unselfconscious. no stiff posing, no symmetrical standing pose, no studio lighting

2. Window stretch: Candid lifestyle photo. Young woman standing at window, one arm raised stretching against window frame, looking out with soft unfocused gaze, chin slightly lifted. Dark hair messy. Loose crop camisole, high-waist shorts. Soft morning window light only, curtains half-open. Body turned 3/4 away from camera. 50mm, handheld, slightly soft. Vibe: slow morning, mind elsewhere, zero posing energy.

3. Mirror selfie: iPhone selfie mirror shot. Young woman, one hand holding phone at slight angle, other hand on hip pulling waist of mini skirt mid-adjustment. Slight smirk, eyes on phone screen not mirror. Black crop camisole, high-waist mini skirt. Bedroom visible in mirror behind. Naturally overexposed, front camera distortion, slight hand motion blur. Vibe: quick outfit check before going out, real and casual.

4. Night bedroom portrait: Candid lifestyle photo. Young woman seated on bed edge, leaning on one hand, head tilted slightly, half-smile, glancing slightly off-camera. Long dark hair slightly tousled. Black satin slip camisole. Dim bedside lamp only, unmade white sheets, warm amber glow. 85mm f/1.8, shallow depth of field, slight film grain. Vibe: quiet and intimate, late-night off-guard moment.

5. Floor coffee: Candid snapshot. Young woman sitting on floor leaning against bed frame, knees pulled up, holding warm coffee mug with both hands, eyes closed mid-sip, head tilted back. Dark hair loosely tied. Cream knit crop sweater, black mini skirt. Soft morning window light only, rumpled duvet above. 35mm, slight grain. Vibe: slow Sunday morning ritual, absorbed.

6. Mid-laugh candid: Candid lifestyle photo. Young woman mid-laugh, hand covering mouth, eyes crinkled shut, head tilting back. Dark hair swinging from movement. Sitting on bed edge, body angled sideways, one leg dangling. White crop camisole, denim mini skirt. Afternoon sunlight through sheer curtains only. Low angle as if friend on floor. 35mm, slight motion blur. Vibe: genuine uncontrollable laugh, not performing.

7. Street paparazzi: Street-level candid from behind-slightly-to-side. Young woman walking on sunny sidewalk, looking down at phone, iced coffee in other hand. Black crop camisole, high-waist mini skirt, sneakers. Hair swinging mid-step. Busy street, afternoon sun only. 85mm telephoto from distance. Vibe: caught mid-errands, zero camera awareness.

8. Bed low angle: Low angle phone selfie. Young woman lying on stomach on bed propped on elbows, reaching to adjust lamp on nightstand, glancing back at camera mid-movement. Dark hair falling around her. Black satin slip camisole. Unmade bed, warm lamp glow only. Slight downward phone angle. Vibe: lazy evening, caught mid-movement.

---

## Key Rules
- First 5–8 words = most weight → lead with shot type (candid-coded, never studio-coded)
- Activity anchor is MANDATORY → physical tension, not static pose
- One lighting source only — never mix two sources
- 30–100 words target
- Gaze NOT at camera by default (unless deliberate selfie)
- Never "eyes locked on camera + confident smirk" together — kills candid feel
- Precise beats verbose: "85mm f/1.8" > "ultra beautiful professional camera"
- Never use character names — causes text to render on image
- No age mentions in the prompt

## Output Format
Output ONLY the optimized prompt. No preamble, no explanation, no markdown.
"""


# Original reference-aware guide — used when reference images are provided (ref image / match pose flows)
SEEDREAM_PROMPT_GUIDE = """
You are a professional AI image generation prompt optimization expert, specializing in optimizing prompts for the Seedream 4.5 model.

## Seedream Prompt Best Practices:

1. **Subject Description**:
   - Clearly describe the subject's appearance features
   - Include basic info such as gender, skin tone, etc.
   - **NEVER explicitly describe hairstyle or hair color** — always write "maintaining the character's exact hairstyle from images 1-3 (base images) only — do NOT copy hairstyle from image 4 (user reference image)". Hair must come exclusively from base images 1-3, not from the reference image or your own description.
   - **Expression (REQUIRED — never omit)**:
     - If a reference image is provided: copy the expression exactly as seen (e.g. "smirking playfully", "lips slightly parted in a sensual gaze", "confident slight smile")
     - If no reference image: infer an appropriate expression from the style/scene context (e.g. sexy style → "sultry half-lidded gaze", cute → "bright sweet smile", home/warm → "soft relaxed smile")
     - Always write the expression explicitly in the prompt — never leave it implied or omitted

2. **Clothing Details**:
   - **When a reference image is provided**: describe the clothing/nudity state EXACTLY as seen in the reference image — even if it's cosplay, fantasy, or unusual clothing. Do NOT substitute with generic clothing like "black turtleneck" or "casual outfit". Describe the actual garment (e.g. "white strapless halter bodysuit with orange accents", "black strappy corset teddy", "red lingerie"). If nude/partially nude, write that explicitly.
   - **When NO reference image is provided**: describe clothing explicitly based on the style/cloth parameters
   - NEVER invent clothing not shown in the reference. NEVER substitute with a "safe" default.

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

## Negative Prompt (always append to generated prompt):
no warm amber glow, no cinematic lighting, no moody atmosphere, no golden hour tone, no sultry gaze, no posed expression, no bedroom eyes, no heavy makeup, no studio lighting, no glamour lighting, no stiff posing, no symmetrical standing pose, no over-sharpened pores, no waxy skin

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

    def _get_image_url(self, image_path: str) -> str:
        """Return the full public URL for the image — passed directly to Kimi vision API."""
        return self.storage.get_full_url(image_path)

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
        # Get public URL — passed directly to Kimi vision API (no base64 conversion)
        image_url = self._get_image_url(image_path)

        prompt = IMAGE_ANALYSIS_PROMPT.format(user_intent=user_intent)

        try:
            logger.info(f"Analyzing reference image via Grok: {image_url[:100]}...")
            analysis = await self.gemini_client.analyze_image_grok(
                image_url=image_url,
                prompt=prompt,
            )
            logger.info(f"Grok reference analysis succeeded: {len(analysis)} chars")
            return analysis.strip()
        except Exception as e:
            logger.error(f"Reference image analysis failed: {e}", exc_info=True)
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
        # Image 4 (last) = user reference for pose/clothing
        if has_reference_image:
            if reference_image_mode == "pose_background":
                parts.append("Use images 1-3 (base images) for the character's face and body features to maintain identity consistency")
                parts.append("Follow the exact pose, body position, camera angle, background environment, and lighting from image 4 (user reference image)")
                parts.append("Follow the clothing/outfit exactly as shown in image 4")
            elif reference_image_mode == "clothing_pose":
                parts.append("Use images 1-3 (base images) for the character's face and body features to maintain identity consistency")
                parts.append("Follow the exact pose, body position, and clothing/outfit exactly as shown in image 4 (user reference image)")
            else:  # custom or default
                parts.append("Use images 1-3 (base images) for the character's face and body features to maintain identity consistency")
                parts.append("Follow the exact pose and clothing as shown in image 4 (user reference image)")
        else:
            # No reference image - use base images + style/cloth params
            parts.append("Use the base reference images (images 1-3) for the character's face and body features")

            style_desc = {
                "sexy": "sensual and alluring pose, confident expression",
                "cute": "cute and sweet expression, playful pose",
                "warm": "warm and inviting atmosphere, soft expression",
                "home": "relaxed home setting, casual and comfortable",
                "exposed": "revealing pose, artistic nude photography style",
                "erotic": "artistic erotic photography, sensual pose, intimate atmosphere",
            }.get(style, "elegant and natural pose")
            parts.append(style_desc)

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

        # Scene from raw prompt (skip generic default messages)
        if raw_prompt and raw_prompt.lower() not in ("generate using reference image", ""):
            parts.append(f"Scene: {raw_prompt}")

        # Technical layer + negative prompt
        parts.append("85mm f/1.8, shallow depth of field, sharp focus on face, clear and well-defined facial features, face identity consistent with reference images")
        parts.append("no extra limbs, no waxy skin, no over-sharpened pores, no cartoon style, no heavy smoothing, no distorted ears, no multiple pupils")

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
            if reference_image_path:
                # When a reference image is provided, strip clothing sentences so Grok
                # cannot accidentally use character description clothing instead of image 4.
                clothing_keywords = r"\b(wear(ing|s)?|dress(ed)?|outfit|cloth(es|ing)?|shirt|turtleneck|sweater|blouse|top|dress|skirt|pants|jeans|coat|jacket|lingerie|bra|underwear|bikini|swimsuit|nude|naked)\b"
                # Remove sentences containing clothing keywords
                sentences = re.split(r'(?<=[.!?])\s+|(?<=\.)\s*', clean_description)
                filtered = [s for s in sentences if not re.search(clothing_keywords, s, re.IGNORECASE)]
                stripped_description = " ".join(filtered).strip() or clean_description
                context_parts.append(f"Character appearance (face/body/hair only): {stripped_description}")
            else:
                context_parts.append(f"Character appearance: {clean_description}")
        if style:
            context_parts.append(f"Style: {style}")
        if cloth:
            context_parts.append(f"Clothing: {cloth}")
        if scene:
            context_parts.append(f"Scene: {scene}")

        # Build instruction blocks
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
            instruction_header = "Generate a detailed English prompt with EXPLICIT image order instructions:"
            instruction_body = (
                "1. Image order: [images 1-3 = character base images, image 4 = user reference photo]\n"
                "2. State that images 1-3 are for character's face and body features (identity consistency)\n"
                "3. State what to take from image 4 based on the reference mode\n"
                "4. Include scene and lighting descriptions\n"
                "5. Use professional photography terminology\n"
                "6. MUST include face emphasis: 'maintaining exact facial features from base reference images, face unchanged, sharp and clear face, well-defined facial features'\n"
                + (
                    "7. Hair: the user explicitly requested to copy hair from image 4 — describe the hairstyle and hair color exactly as seen in image 4.\n"
                    if re.search(r'\bhair\b', raw_prompt, re.IGNORECASE) else
                    "7. Hair: write 'maintaining the character's exact hairstyle from images 1-3 (base images) only, do NOT copy or reference hairstyle from image 4' — never describe specific hair color or style\n"
                )
                + "8. Clothing: copy EXACTLY what is visible in image 4 — describe the actual garment literally (e.g. 'white strapless halter bodysuit with orange accents', 'black strappy corset teddy', 'nude'). NEVER substitute with a generic outfit like 'black turtleneck' or 'casual outfit'. Even cosplay or fantasy clothing must be described as-is.\n"
                f"{'9' if reference_image_path else '8'}. Expression (REQUIRED): "
                + ("copy the facial expression exactly from image 4 (e.g. 'smirking playfully', 'sultry half-lidded gaze', 'lips slightly parted'). Never omit the expression.\n"
                   if reference_image_path else
                   "infer an appropriate expression from the style/scene (e.g. sexy→'sultry half-lidded gaze', cute→'bright sweet smile', warm/home→'soft relaxed smile'). Never omit the expression.\n")
                + "10. Keep the prompt at a moderate length (100-200 words)"
            )

        user_context = "\n".join(context_parts) if context_parts else ""

        # --- Reference image path: single combined Grok vision call (analyze + generate in one shot) ---
        if reference_image_path:
            mode_instructions = self._get_mode_instructions(reference_image_mode)
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

            image_url = self._get_image_url(reference_image_path)
            combined_user_prompt = f"""Optimize the following generation request into a high-quality Seedream prompt.

The attached image IS the user's reference image. Analyze what you see in it (pose, composition, clothing/nudity state, lighting, background, atmosphere) and directly incorporate those observations into the optimized prompt — no need to describe your analysis separately.

User request: {raw_prompt}

{user_context}

{instruction_header}
{instruction_body}{reference_context}

USER OVERRIDE RULE: If the User request explicitly instructs something that conflicts with the default rules above (e.g. "keep the hair like ref image", "use ref image hair color", "change clothing to X", "background should be Y"), FOLLOW THE USER REQUEST — it takes priority over the default rules.

IMPORTANT: Output ONLY the optimized prompt. No preamble, no explanations."""

            try:
                logger.info(f"Calling Grok with reference image (combined analyze+generate): {image_url[:80]}...")
                optimized = await self.gemini_client.generate_prompt_with_reference_image(
                    image_url=image_url,
                    system_prompt=SEEDREAM_PROMPT_GUIDE,
                    user_prompt=combined_user_prompt,
                    max_tokens=500,
                    temperature=0.7,
                )
                logger.info(f"Grok combined call succeeded: {len(optimized)} chars")
            except Exception as e:
                logger.error(f"Grok combined call failed: {e}, using fallback")
                optimized = self._build_fallback_prompt(
                    raw_prompt, style, cloth, character_description,
                    has_reference_image=True,
                    reference_image_mode=reference_image_mode,
                )
                return {
                    "success": True,
                    "original_prompt": raw_prompt,
                    "optimized_prompt": optimized,
                    "style": style,
                    "cloth": cloth,
                }

        else:
            # No reference image — text-only Grok call, use vlog/selfie framework
            no_ref_instructions = (
                "Follow the 6-layer framework from your system prompt.\n\n"
                "CRITICAL — avoid these exact mistakes:\n"
                "- NEVER start with 'Soft portrait photo' or 'Professional photography' → causes studio/glamour drift. Use 'Candid snapshot' or 'Candid lifestyle photo' instead.\n"
                "- NEVER use a static posture as the activity anchor (e.g. 'propped on elbows'). Activity must have physical tension: 'reaching for something mid-movement', 'adjusting strap looking down', 'caught pushing hair out of face'.\n"
                "- NEVER combine 'eyes locked on camera' + 'confident smirk' → kills candid feel entirely.\n"
                "- NEVER mix two light sources (e.g. window light + lamp). Pick ONE only.\n\n"
                "Build the prompt:\n"
                "1. Shot type — candid-coded opener (Candid snapshot / Candid lifestyle photo / iPhone selfie mirror shot)\n"
                "2. Subject anchor — 3–5 features (eyes, hair, skin, expression matched to activity, max 2 outfit items)\n"
                "3. Activity anchor — MANDATORY physical action with tension, not a static pose. Include body posture + where gaze is directed (default: NOT at camera)\n"
                "4. Authenticity marker — 1–2 (phone grain / slight motion blur / overexposed / candid angle)\n"
                "5. Background — specific place + ONE light source only\n"
                "6. Vibe sentence — one closing line\n"
                "7. Technical layer — specific spec (85mm f/1.8 / front camera distortion / 16mm handheld)\n"
                "8. Anti-stiff: break symmetry, gravity pull, hands occupied, gaze away, hair movement cue\n"
                "9. Append negative prompt\n"
                "10. Keep 30–100 words total"
            )
            messages = [
                {"role": "system", "content": SEEDREAM_VLOG_PROMPT_GUIDE},
                {
                    "role": "user",
                    "content": f"""Optimize the following generation request into a high-quality Seedream prompt:

User request: {raw_prompt}

{user_context}

{no_ref_instructions}""",
                },
            ]
            try:
                optimized = await self.gemini_client.chat_grok(
                    messages=messages,
                    temperature=0.7,
                    max_tokens=500,
                )
            except Exception as e:
                logger.error(f"Prompt optimization failed: {e}", exc_info=True)
                fallback = self._build_fallback_prompt(
                    raw_prompt, style, cloth, character_description,
                    has_reference_image=False,
                    reference_image_mode=reference_image_mode,
                )
                return {
                    "success": True,
                    "original_prompt": raw_prompt,
                    "optimized_prompt": fallback,
                    "style": style,
                    "cloth": cloth,
                }

        # Shared refusal check and return
        optimized_lower = optimized.lower()
        starts_with_refusal = optimized_lower.startswith((
            "i can't", "i cannot", "i'm sorry", "sorry,",
            "i apologize", "i'm unable", "i must decline",
            "i will not", "i won't",
        ))
        refusal_phrases = [
            "cannot assist with", "can't help with", "unable to help with",
            "not able to generate", "against my guidelines",
            "cannot create this", "can't create this",
            "not allowed to generate", "violates my",
            "content policy", "safety guidelines",
        ]
        has_refusal = any(phrase in optimized_lower for phrase in refusal_phrases)
        if starts_with_refusal or has_refusal:
            logger.warning(f"GPT refused prompt optimization: {optimized[:200]}")
            optimized = self._build_fallback_prompt(
                raw_prompt, style, cloth, character_description,
                has_reference_image=bool(reference_image_path),
                reference_image_mode=reference_image_mode,
            )

        return {
            "success": True,
            "original_prompt": raw_prompt,
            "optimized_prompt": self._strip_preamble(optimized.strip()),
            "style": style,
            "cloth": cloth,
        }

    def _strip_preamble(self, text: str) -> str:
        """Remove common model preamble phrases before the actual prompt."""
        # Match lines like "Here's the optimized Seedream prompt:" or "Here is the prompt:"
        text = re.sub(
            r"^(?:here(?:'s| is)(?: the)?(?: optimized)?(?: seedream)?(?: prompt)?[:\s]*\n?)",
            "",
            text,
            flags=re.IGNORECASE,
        )
        return text.strip()

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
