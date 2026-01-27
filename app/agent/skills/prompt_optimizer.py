"""Prompt optimization skill using GPT-4o."""
import base64
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.skills.base import BaseSkill
from app.clients.gpt import get_gpt_client
from app.services.storage import get_storage_service


# Seedream prompt optimization guide
SEEDREAM_PROMPT_GUIDE = """
你是一個專業的 AI 圖片生成 Prompt 優化專家，專門為 Seedream 4.5 模型優化 prompt。

## Seedream Prompt 最佳實踐:

1. **主體描述** (Subject):
   - 清楚描述主體的外觀特徵
   - 包含年齡、性別、膚色等基本資訊
   - 描述髮型、表情、姿勢

2. **服裝細節** (Clothing):
   - 具體描述服裝款式、材質、顏色
   - 根據風格調整服裝描述
   - **重要**: 服裝必須在 prompt 中明確描述，不要從任何參考圖繼承

3. **場景設定** (Scene/Setting):
   - 描述環境背景
   - 包含光線、時間、氛圍

4. **攝影風格** (Photography Style):
   - 鏡頭角度 (close-up, medium shot, full body)
   - 光線類型 (natural light, studio lighting, golden hour)
   - 畫質描述 (high quality, 4K, photorealistic)

5. **風格關鍵詞**:
   - sexy: 性感、魅惑、自信的姿態
   - cute: 可愛、甜美、青春活力
   - warm: 溫馨、舒適、自然光線
   - home: 居家、放鬆、私密感

## 多圖參考指南 (Multiple Reference Images):
當同時有 Base Images 和用戶參考圖時，Seedream 會收到多張參考圖:
- Base images (前幾張) → 用於保持角色臉部特徵和身材比例一致
- 用戶參考圖 (最後一張) → 用於參考姿勢/構圖/氛圍/光線

Prompt 必須使用特殊格式明確區分參考目標：

**格式**:
[Reference Character] Based on the character's face and body shape from the base reference images,
[Reference Pose/Composition/Style] following the [具體姿勢/構圖/氛圍描述] from the additional reference image,
generate [主體描述], wearing [服裝描述], in [場景描述]...

**重點**:
1. 使用 [Reference Character] 指向 base images 的臉部和身材
2. 使用 [Reference Pose/Composition/Style] 指向用戶參考圖的姿勢/構圖/氛圍
3. 服裝必須明確描述，絕對不要從任何參考圖繼承穿著
4. 將 GPT-4V 分析出的姿勢、構圖、氛圍描述放在 [Reference Pose...] 區塊

## 重要注意事項:
1. **禁止在 prompt 中使用角色名稱**：絕對不要把角色名字（如 "Sake II"、"Luna" 等）寫進 prompt，這會導致文字被渲染到圖片上
2. 只用 "the character" 或 "the person from base reference images" 來指代角色
3. 角色外觀資訊只用來了解外觀特徵，不要直接複製名字進 prompt
4. 不要在 prompt 中提及任何人物的年齡或出生年份

## 輸出格式:
請直接輸出優化後的英文 prompt，不需要其他說明。
"""


IMAGE_ANALYSIS_PROMPT = """分析這張圖片，提取以下資訊用於生成類似風格的圖片：

1. **姿勢/動作**: 詳細描述人物的姿勢、身體位置、手勢、頭部角度等
2. **構圖**: 描述鏡頭角度、取景方式（全身/半身/特寫）、人物在畫面中的位置
3. **氛圍/Vibe**: 整體感覺、情緒、風格
4. **光線**: 光線來源、方向、色溫
5. **場景/背景**: 環境描述

用戶說他想參考: {user_intent}

請用英文輸出一段描述，可以直接用於圖片生成 prompt。格式如下：
- 先描述姿勢和動作
- 再描述構圖和角度
- 最後描述氛圍和光線

只輸出描述，不要其他說明。"""


class PromptOptimizerSkill(BaseSkill):
    """Skill for optimizing prompts using Seedream best practices."""

    name = "prompt_optimizer"
    description = "Optimize user prompts for better image generation results"

    def __init__(self):
        self.gpt_client = get_gpt_client()
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
            user_intent: What the user wants to reference (e.g., "參考動作", "參考氛圍")

        Returns:
            Text description of the image that can be used in the prompt
        """
        # Convert to URL (or base64 data URI for localhost)
        image_url = await self._get_image_url_or_base64(image_path, db)

        prompt = IMAGE_ANALYSIS_PROMPT.format(user_intent=user_intent)

        try:
            analysis = await self.gpt_client.analyze_image(
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

        # For face_swap mode, use minimal prompt - only face replacement instruction
        if has_reference_image and reference_image_mode == "face_swap":
            parts.append("[Reference Character] Replace the person's face with the character's facial features from the base reference images")
            parts.append("Keep the pose, clothing, background, lighting, composition, and body position completely identical")
            parts.append("Seamless face blend, matching skin tone and lighting direction, photorealistic, high detail")
            return ". ".join(parts) + "."

        # Character description - use generic reference to avoid including character names
        # Don't include character_description directly as it may contain the character name
        parts.append("[Reference Character] Use the face and body features from the base reference images")

        # Reference instructions based on mode (face_swap already handled above)
        if has_reference_image:
            if reference_image_mode == "pose_background":
                parts.append("[Reference Pose] Follow the body pose and position from the last reference image")
                parts.append("[Reference Background] Use the same background setting and lighting from the last reference image")
            elif reference_image_mode == "clothing_pose":
                parts.append("[Reference Pose] Follow the body pose and position from the last reference image")
                parts.append("[Reference Clothing] Wear the same outfit/clothing as shown in the last reference image")
            else:  # custom or default
                parts.append("[Reference Pose] Follow the pose, composition, and atmosphere from the last reference image")

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
        parts.append("high quality, 4K, professional photography, soft studio lighting, sharp focus")

        return ", ".join(parts)

    async def _optimize_prompt(self, params: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
        """Optimize a user prompt for Seedream."""
        raw_prompt = params.get("prompt", "")
        style = params.get("style", "")
        cloth = params.get("cloth", "")
        scene = params.get("scene_description", "")
        character_description = params.get("character_description", "")
        reference_image_path = params.get("reference_image_path")
        reference_image_mode = params.get("reference_image_mode")
        reference_description = params.get("reference_description", "")

        # Build context for optimization
        context_parts = []
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
            context_parts.append(f"角色外觀: {clean_description}")
        if style:
            context_parts.append(f"風格: {style}")
        if cloth:
            context_parts.append(f"服裝: {cloth}")
        if scene:
            context_parts.append(f"場景: {scene}")

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
                context_parts.append(f"參考圖片分析結果 (姿勢/構圖/氛圍):\n{reference_analysis}")
                context_parts.append(f"參考模式: {reference_image_mode or 'custom'}")
                reference_context = f"""
6. {mode_instructions}
   - 系統會將 Base Images + 用戶參考圖 一起傳給 Seedream
   - 將上面「參考圖片分析結果」的姿勢/構圖/氛圍描述融入 prompt"""
            else:
                # GPT-4V analysis failed (likely NSFW content), but still need to tell GPT about reference image
                context_parts.append("參考圖片: 有提供參考圖片，但無法分析內容")
                context_parts.append(f"參考模式: {reference_image_mode or 'custom'}")
                reference_context = f"""
6. {mode_instructions}
   - 系統會將 Base Images + 用戶參考圖 一起傳給 Seedream
   - 因為無法分析參考圖內容，請根據參考模式生成適當的標記"""

        user_context = "\n".join(context_parts) if context_parts else ""

        messages = [
            {"role": "system", "content": SEEDREAM_PROMPT_GUIDE},
            {
                "role": "user",
                "content": f"""請優化以下生成請求為高品質的 Seedream prompt:

用戶請求: {raw_prompt}

{user_context}

{"請生成一個結構化的英文 prompt，確保:" if reference_image_mode == "face_swap" else "請生成一個詳細的英文 prompt，確保:"}
{"""1. 使用 REPLACE 模板格式：Replace the face with... Keep [elements] unchanged.
2. 明確列出所有要保留的元素（pose, clothing, background, lighting, body position）
3. 強調 seamless blend 和 skin tone matching
4. 保持 prompt 結構化 (50-100 字)""" if reference_image_mode == "face_swap" else f"""1. 包含主體的詳細描述
2. 符合指定的風格和服裝
3. 包含場景和光線描述
4. 使用專業攝影術語
5. 保持 prompt 長度適中 (100-200 字)"""}{reference_context}""",
            },
        ]

        try:
            optimized = await self.gpt_client.chat_creative(
                messages=messages,
                temperature=0.7,
                max_tokens=500,
            )

            # Check if GPT refused (content policy)
            optimized_lower = optimized.lower()
            refusal_indicators = [
                "i cannot", "i can't", "i'm unable", "cannot assist",
                "can't help", "won't help", "unable to help", "not able to",
                "sorry", "apologize", "inappropriate", "policy",
                "against my", "guidelines", "cannot create", "can't create",
                "explicit", "nudity", "sexualized", "minor",
                "不能", "無法", "抱歉", "對不起", "違反"
            ]
            # Also check if response starts with refusal pattern
            starts_with_refusal = optimized_lower.startswith(("i can't", "i cannot", "i'm sorry", "sorry"))
            if any(ind in optimized_lower for ind in refusal_indicators) or starts_with_refusal:
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
        no_name_warning = "- **絕對禁止**在 prompt 中使用任何角色名稱或年齡，用 'the character' 代替"
        if mode == "face_swap":
            return f"""
**重要 - Face Swap 模式 (只換臉)**:
- 使用類似 image edit 的 REPLACE 模板格式
- 結構: "Replace the face with [character description]. Keep [preserved elements] unchanged."
- 必須明確列出要保留的元素：pose, clothing, background, lighting, composition, body position
- 強調 seamless blend 和 matching skin tone/lighting
{no_name_warning}
- 使用 [Reference Character] 標記指向 base images
- 範例: [Reference Character] Replace the person's face with the character's facial features from the base reference images. Keep the pose, clothing, background, lighting, composition, and body position completely identical. Seamless face blend, matching skin tone and lighting direction, photorealistic, high detail."""
        elif mode == "pose_background":
            return f"""
**重要 - Pose & Background 模式**:
- 參考「最後一張參考圖」的動作姿勢和背景構圖
- 服裝根據用戶描述調整（不從參考圖繼承）
{no_name_warning}
- 必須使用以下標記:
  - [Reference Character] 指向 base images (臉部和身材)，不要寫角色名字
  - [Reference Pose] 參考最後參考圖的姿勢
  - [Reference Background] 參考最後參考圖的背景"""
        elif mode == "clothing_pose":
            return f"""
**重要 - Clothing & Pose 模式**:
- 參考「最後一張參考圖」的服裝穿著和動作姿勢
- 背景根據用戶描述生成
{no_name_warning}
- 必須使用以下標記:
  - [Reference Character] 指向 base images (臉部和身材)，不要寫角色名字
  - [Reference Pose] 參考最後參考圖的姿勢
  - [Reference Clothing] 參考最後參考圖的穿著"""
        else:  # custom or None
            return f"""
**Custom 模式**:
- 根據用戶描述自由參考圖片的相關元素
{no_name_warning}
- 靈活使用 [Reference Pose], [Reference Background], [Reference Clothing] 等標記"""

    async def optimize(
        self,
        prompt: str,
        style: Optional[str] = None,
        cloth: Optional[str] = None,
        scene_description: Optional[str] = None,
        character_description: Optional[str] = None,
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
