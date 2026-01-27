"""Main Agent class with o1-mini reasoning."""
import asyncio
import json
import uuid
import logging
from typing import Any, Optional
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session
from app.clients.gpt import get_gpt_client, GPTClient
from app.agent.skills.character import CharacterSkill
from app.agent.skills.prompt_optimizer import PromptOptimizerSkill
from app.agent.skills.image_generator import ImageGeneratorSkill
from app.agent.skills.video_generator import VideoGeneratorSkill
from app.agent.skills.edit_prompt_optimizer import EditPromptOptimizerSkill
from app.agent.skills.image_editor import ImageEditorSkill
from app.agent.skills.instagram_gallery import InstagramGallerySkill
from app.schemas.agent import (
    AgentChatResponse,
    ConversationState,
    PendingGeneration,
    PendingGenerationParams,
    PendingEdit,
    PendingEditParams,
    Intent,
    GenerationTask,
    GenerationTaskStatus,
)

logger = logging.getLogger(__name__)


# System prompt for o1-mini reasoning
AGENT_SYSTEM_PROMPT = """你是一個 AI 角色內容生成助手。你的任務是理解用戶的需求，並決定要採取什麼行動。

## 可用功能:

1. **generate_image** - 生成圖片
   - content_type:
     - "base" - 創建角色基礎圖，用於建立角色外觀身份
     - "content_post" - 生成內容圖片，會參考角色的 base images
   - style: sexy, cute, warm, home, exposed, erotic
   - cloth: daily, fashion, sexy_lingerie, sexy_underwear, home_wear, sports, nude
   - scene_description: 場景描述

2. **generate_video** - 生成影片 (會先生成圖片再轉影片)
   - 同 generate_image 的參數
   - video_prompt: 影片動作描述

3. **create_character** - 創建新角色
   - name: 角色名稱
   - description: 角色描述
   - gender: 性別

4. **update_character** - 更新角色資訊

5. **add_base_image** - 為角色添加現有圖片作為 base image（不生成新圖）
   - image_url: 圖片的 URL（必須，用戶提供的圖片連結）
   - 當用戶說「用這張圖作為 base image」並提供 URL 時使用此功能

6. **list_characters** - 列出所有角色

7. **general_chat** - 一般對話，不需要執行任何操作

8. **fetch_instagram** - 從 Instagram 貼文下載參考圖片
   - url: Instagram 貼文 URL (例如 https://www.instagram.com/p/ABC123/)

## 回應格式:

請以 JSON 格式回應，包含以下字段:
```json
{
  "intent": "generate_image | generate_video | create_character | update_character | add_base_image | list_characters | general_chat | fetch_instagram",
  "reasoning": "你的推理過程，解釋為什麼選擇這個意圖",
  "parameters": {
    // 根據 intent 填寫相應參數
  },
  "needs_confirmation": true,  // 生成類操作需要確認，其他操作不需要
  "response_message": "給用戶的回應訊息"
}
```

## 重要規則:

1. 生成圖片或影片時，必須設置 needs_confirmation: true
2. 如果用戶沒有選擇角色，提醒他們先選擇角色
3. **非常重要**: 如果 Base Images 數量為 0，你應該:
   - 設置 content_type: "base" 來先生成 base image
   - 在 response_message 中告訴用戶「我將先幫你生成一張 Base Image 來建立角色外觀」
4. 只有當 Base Images 數量 > 0 時，才使用 content_type: "content_post"
5. 影片只支持 image-to-video，會自動先生成圖片
6. 用自然、友善的中文回應用戶
7. **add_base_image 使用時機**: 當用戶提供一個圖片 URL 並說要「作為 base image」、「當作基礎圖」、「添加到 base images」時，使用 add_base_image intent，並將 URL 放入 parameters.image_url
8. **參考圖片處理**: 當「參考圖片」顯示為「有」時：
   - 表示用戶已經上傳了參考圖片，不需要再要求用戶提供
   - 應直接使用 generate_image intent
   - 根據參考模式來處理：
     * Face Only (只換臉): 保留參考圖的姿勢、背景、服裝（包括裸露狀態），只換角色的臉
     * Pose & Background: 參考姿勢和背景，服裝根據用戶描述調整
     * Clothing & Pose: 參考服裝和姿勢，背景根據用戶描述調整
     * Custom: 根據用戶訊息自由參考
   - 在 scene_description 中描述要生成的內容，不需要再問用戶要圖片
"""


# System prompt for image editing
IMAGE_EDIT_SYSTEM_PROMPT = """你是一個 AI 圖片編輯助手。用戶會提供一張圖片和編輯指令，你需要理解編輯意圖並生成適當的回應。

## 編輯類型:

1. **background** - 換背景: 更換圖片背景，保持人物不變
2. **outfit** - 換服裝: 更換服裝，保持臉部和姿勢不變
3. **style** - 風格轉換: 改變整體風格（如動漫、油畫等）
4. **remove** - 移除元素: 從圖片中移除某個元素
5. **add** - 添加元素: 在圖片中添加元素
6. **replace** - 替換元素: 用新元素替換原有元素
7. **modify** - 一般修改: 其他類型的修改

## 回應格式:

請以 JSON 格式回應:
```json
{
  "edit_type": "background | outfit | style | remove | add | replace | modify",
  "reasoning": "你的理解和分析",
  "response_message": "給用戶的友善中文回應，說明你理解了什麼並準備執行",
  "suggestions": ["其他可能的編輯建議1", "建議2", "建議3"]
}
```

## 重要規則:
1. 準確識別編輯類型
2. 用友善的中文回應
3. 提供 2-3 個相關的編輯建議
"""


@dataclass
class ConversationMessage:
    """A message in the conversation."""
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ConversationSession:
    """Conversation session state."""
    id: str
    character_id: Optional[str] = None
    messages: list[ConversationMessage] = field(default_factory=list)
    pending_generation: Optional[PendingGeneration] = None
    pending_edit: Optional[PendingEdit] = None
    state: ConversationState = ConversationState.IDLE
    created_at: datetime = field(default_factory=datetime.utcnow)
    fetched_instagram_images: list[dict] = field(default_factory=list)
    active_tasks: dict[str, GenerationTask] = field(default_factory=dict)

    def add_message(self, role: str, content: str):
        self.messages.append(ConversationMessage(role=role, content=content))
        # Keep only last 10 messages to avoid context overflow
        if len(self.messages) > 20:
            self.messages = self.messages[-20:]


class Agent:
    """Main agent class with o1-mini reasoning and skill execution."""

    def __init__(self):
        self.gpt_client = get_gpt_client()
        self.sessions: dict[str, ConversationSession] = {}

        # Initialize skills
        self.character_skill = CharacterSkill()
        self.prompt_optimizer = PromptOptimizerSkill()
        self.image_generator = ImageGeneratorSkill()
        self.video_generator = VideoGeneratorSkill()
        self.edit_prompt_optimizer = EditPromptOptimizerSkill()
        self.image_editor = ImageEditorSkill()
        self.instagram_gallery = InstagramGallerySkill()

    def _get_or_create_session(
        self,
        session_id: Optional[str],
        character_id: Optional[str] = None,
    ) -> ConversationSession:
        """Get or create a conversation session."""
        if not session_id:
            session_id = str(uuid.uuid4())

        if session_id not in self.sessions:
            self.sessions[session_id] = ConversationSession(
                id=session_id,
                character_id=character_id,
            )
        else:
            # Update character_id if provided
            if character_id:
                self.sessions[session_id].character_id = character_id

        return self.sessions[session_id]

    def _build_messages_for_reasoning(
        self,
        session: ConversationSession,
        context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """Build messages for o1-mini reasoning."""
        messages = [
            {"role": "user", "content": AGENT_SYSTEM_PROMPT},
        ]

        # Add context about current state
        reference_image_info = "無"
        if context.get('reference_image_path'):
            mode = context.get('reference_image_mode', 'custom')
            mode_display = {
                'face_swap': 'Face Only (只換臉)',
                'pose_background': 'Pose & Background (參考姿勢和背景)',
                'clothing_pose': 'Clothing & Pose (參考服裝和姿勢)',
                'custom': 'Custom (自訂)',
            }.get(mode, mode)
            reference_image_info = f"有（用戶已上傳參考圖片，模式: {mode_display}）"
        context_msg = f"""
當前狀態:
- 選中的角色: {context.get('character_name', '未選擇')}
- 角色 ID: {context.get('character_id', 'N/A')}
- Base Images 數量: {context.get('base_image_count', 0)}
- 角色描述: {context.get('character_description', 'N/A')}
- 參考圖片: {reference_image_info}
"""
        messages.append({"role": "user", "content": context_msg})

        # Add conversation history
        for msg in session.messages[-6:]:  # Last 6 messages for context
            messages.append({
                "role": msg.role,
                "content": msg.content,
            })

        return messages

    def _detect_intent_simple(self, message: str) -> dict[str, Any]:
        """Simple intent detection without GPT (fallback for NSFW)."""
        message_lower = message.lower()

        # Check for Instagram URL
        if "instagram.com/p/" in message_lower or "instagram.com/reel/" in message_lower:
            return {
                "intent": "fetch_instagram",
                "reasoning": "本地檢測到 Instagram URL",
                "parameters": {"url": message},
                "needs_confirmation": False,
                "response_message": "正在從 Instagram 下載參考圖片...",
            }

        # Check for add_base_image intent
        base_image_keywords = ["base image", "base_image", "基礎圖", "作為 base", "當作 base", "添加到 base"]
        has_base_image_intent = any(kw in message_lower for kw in base_image_keywords)

        # Extract URL from message
        import re
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        urls = re.findall(url_pattern, message)

        if has_base_image_intent and urls:
            return {
                "intent": "add_base_image",
                "reasoning": "本地檢測到添加 base image 意圖",
                "parameters": {"image_url": urls[0]},
                "needs_confirmation": False,
                "response_message": f"正在將圖片添加為 Base Image...",
            }

        # Check for image generation keywords
        image_keywords = ["生成", "創建", "做", "畫", "圖", "照片", "image", "photo", "generate", "create"]
        video_keywords = ["影片", "視頻", "video", "動畫"]

        is_image = any(kw in message_lower for kw in image_keywords)
        is_video = any(kw in message_lower for kw in video_keywords)

        # Detect style/cloth from message
        style = None
        cloth = None
        if any(kw in message_lower for kw in ["性感", "sexy", "誘惑"]):
            style = "sexy"
        if any(kw in message_lower for kw in ["裸", "nude", "全裸", "露點"]):
            cloth = "nude"
            style = "erotic"
        elif any(kw in message_lower for kw in ["內衣", "lingerie", "underwear"]):
            cloth = "sexy_lingerie"

        if is_video:
            return {
                "intent": "generate_video",
                "reasoning": "本地檢測到影片生成意圖",
                "parameters": {
                    "content_type": "content_post",
                    "style": style,
                    "cloth": cloth,
                    "scene_description": message,
                },
                "needs_confirmation": True,
                "response_message": "好的，我來幫你生成影片。請確認以下設定：",
            }
        elif is_image:
            return {
                "intent": "generate_image",
                "reasoning": "本地檢測到圖片生成意圖",
                "parameters": {
                    "content_type": "content_post",
                    "style": style,
                    "cloth": cloth,
                    "scene_description": message,
                },
                "needs_confirmation": True,
                "response_message": "好的，我來幫你生成圖片。請確認以下設定：",
            }
        else:
            return {
                "intent": "general_chat",
                "reasoning": "無法識別意圖",
                "parameters": {},
                "needs_confirmation": False,
                "response_message": "請告訴我你想要生成什麼樣的圖片或影片？",
            }

    async def _analyze_intent(
        self,
        session: ConversationSession,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Use o1-mini to analyze user intent."""
        messages = self._build_messages_for_reasoning(session, context)
        last_message = session.messages[-1].content if session.messages else ""

        try:
            result = await self.gpt_client.chat_reasoning_json(
                messages=messages,
                max_tokens=2000,
            )

            # Check if GPT refused (content policy)
            response_msg = result.get("response_message", "").lower()
            refusal_indicators = [
                "不能協助", "無法協助", "不能幫助", "無法幫助",
                "cannot", "can't", "unable", "sorry", "apologize",
                "policy", "inappropriate", "不適當", "違反"
            ]
            if any(ind in response_msg for ind in refusal_indicators):
                logger.warning("GPT refused due to content policy, using fallback")
                return self._detect_intent_simple(last_message)

            return result
        except Exception as e:
            logger.error(f"Intent analysis failed: {e}")
            # Use fallback
            return self._detect_intent_simple(last_message)

    async def _build_context(
        self,
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Build context about the current character."""
        context = {
            "character_id": character_id,
            "character_name": None,
            "character_description": None,
            "base_image_count": 0,
            "base_image_urls": [],
        }

        if character_id:
            result = await self.character_skill.execute(
                action="get",
                params={},
                character_id=character_id,
                db=db,
            )
            if result.get("success"):
                char = result.get("character", {})
                context["character_name"] = char.get("name")
                context["character_description"] = char.get("description")
                base_images = result.get("base_images", [])
                context["base_image_count"] = len(base_images)
                context["base_image_urls"] = [img["url"] for img in base_images]

        return context

    async def process_message(
        self,
        message: str,
        character_id: Optional[str],
        session_id: Optional[str],
        reference_image_path: Optional[str],
        reference_image_mode: Optional[str],
        db: AsyncSession,
    ) -> AgentChatResponse:
        """Process a user message and return response."""
        logger.info(f"=== Processing message ===")
        logger.info(f"Message: {message[:100]}...")
        logger.info(f"Character ID: {character_id}")
        logger.info(f"Session ID: {session_id}")
        logger.info(f"Reference image mode: {reference_image_mode}")

        session = self._get_or_create_session(session_id, character_id)
        session.add_message("user", message)
        session.state = ConversationState.UNDERSTANDING

        # If no explicit reference image but we have fetched Instagram images, use the first one
        if not reference_image_path and session.fetched_instagram_images:
            # Auto-use the first Instagram image as reference
            first_ig_image = session.fetched_instagram_images[0]
            reference_image_path = first_ig_image.get("path")
            # Default to face_swap mode for Instagram images if no mode specified
            if not reference_image_mode:
                reference_image_mode = "face_swap"
            logger.info(f"Auto-using Instagram image as reference: {reference_image_path}, mode: {reference_image_mode}")
            # Clear fetched images after using
            session.fetched_instagram_images = []

        # Build context
        context = await self._build_context(character_id, db)
        context["reference_image_path"] = reference_image_path  # Include for intent analysis
        context["reference_image_mode"] = reference_image_mode  # Include mode for prompt generation
        # Log context without full image path to avoid long logs
        log_context = {k: v for k, v in context.items() if k != "reference_image_path"}
        log_context["has_reference_image"] = bool(reference_image_path)
        logger.info(f"Context: {log_context}")

        # Quick path: if reference image with non-custom mode, directly use generate_image
        # This allows users to click send without typing a message
        if reference_image_path and reference_image_mode and reference_image_mode != "custom":
            logger.info(f"Quick path: reference image with mode {reference_image_mode}, using generate_image directly")
            mode_descriptions = {
                "face_swap": "使用參考圖片進行換臉，保持原圖的姿勢、背景和服裝",
                "pose_background": "參考圖片的姿勢和背景",
                "clothing_pose": "參考圖片的服裝和姿勢",
            }
            intent_result = {
                "intent": "generate_image",
                "reasoning": f"用戶上傳參考圖片並選擇 {reference_image_mode} 模式",
                "parameters": {
                    "content_type": "content_post",
                    "scene_description": message if message.strip() else mode_descriptions.get(reference_image_mode, ""),
                },
                "needs_confirmation": True,
                "response_message": f"好的，我來幫你{mode_descriptions.get(reference_image_mode, '生成圖片')}。請確認以下設定：",
            }
        else:
            # Analyze intent with o1-mini
            session.state = ConversationState.PLANNING
            intent_result = await self._analyze_intent(session, context)
        logger.info(f"Intent result: {intent_result}")

        intent = intent_result.get("intent", "general_chat")
        reasoning = intent_result.get("reasoning", "")
        parameters = intent_result.get("parameters", {})
        needs_confirmation = intent_result.get("needs_confirmation", False)
        response_message = intent_result.get("response_message", "")

        logger.info(f"Detected intent: {intent}")
        logger.info(f"Parameters: {parameters}")

        # Handle different intents
        if intent == "general_chat":
            session.add_message("assistant", response_message)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=response_message,
                session_id=session.id,
                state=ConversationState.IDLE,
            )

        elif intent in ("generate_image", "generate_video"):
            if not character_id:
                msg = "請先選擇一個角色再進行生成。"
                session.add_message("assistant", msg)
                return AgentChatResponse(
                    message=msg,
                    session_id=session.id,
                    state=ConversationState.IDLE,
                )

            # Optimize prompt
            scene_desc = parameters.get("scene_description", message)
            style = parameters.get("style", "")
            cloth = parameters.get("cloth", "")

            # Pass reference image path and mode for GPT-4V analysis (not for Seedream reference)
            optimized_prompt = await self.prompt_optimizer.optimize(
                prompt=scene_desc,
                style=style,
                cloth=cloth,
                character_description=context.get("character_description"),
                reference_image_path=reference_image_path,
                reference_image_mode=reference_image_mode,
                reference_description=message if reference_image_path else None,
                db=db,
            )

            # Create pending generation
            session.pending_generation = PendingGeneration(
                skill="image_generator" if intent == "generate_image" else "video_generator",
                params=PendingGenerationParams(
                    content_type=parameters.get("content_type", "content_post"),
                    style=style,
                    cloth=cloth,
                    scene_description=scene_desc,
                    aspect_ratio=parameters.get("aspect_ratio", "9:16"),
                    reference_image_path=reference_image_path,
                    reference_image_mode=reference_image_mode,
                ),
                optimized_prompt=optimized_prompt,
                reasoning=reasoning,
                suggestions=[
                    "換成更性感的風格",
                    "改成居家場景",
                    "使用不同的服裝",
                ],
            )
            session.state = ConversationState.AWAITING_CONFIRMATION

            session.add_message("assistant", response_message)
            return AgentChatResponse(
                message=response_message,
                session_id=session.id,
                state=ConversationState.AWAITING_CONFIRMATION,
                pending_generation=session.pending_generation,
            )

        elif intent == "create_character":
            result = await self.character_skill.execute(
                action="create",
                params=parameters,
                character_id=None,
                db=db,
            )
            msg = result.get("message", response_message)
            session.add_message("assistant", msg)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=msg,
                session_id=session.id,
                state=ConversationState.IDLE,
                action_taken="created_character",
                result=result,
            )

        elif intent == "list_characters":
            result = await self.character_skill.execute(
                action="list",
                params={},
                character_id=None,
                db=db,
            )
            characters = result.get("characters", [])
            if characters:
                char_list = "\n".join([f"- {c['name']} ({c['status']})" for c in characters])
                msg = f"現有角色:\n{char_list}"
            else:
                msg = "目前沒有任何角色。請創建一個新角色開始。"
            session.add_message("assistant", msg)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=msg,
                session_id=session.id,
                state=ConversationState.IDLE,
            )

        elif intent == "fetch_instagram":
            instagram_url = parameters.get("url") or message
            result = await self.instagram_gallery.execute(
                action="fetch",
                params={"url": instagram_url},
                character_id=character_id,
                db=db,
            )

            if result.get("success"):
                images = result.get("images", [])
                image_list = "\n".join(
                    [f"- [{i+1}] {img['full_url']}" for i, img in enumerate(images)]
                )
                msg = f"已下載 {len(images)} 張參考圖片:\n{image_list}\n\n請告訴我你想用哪一張來生成，以及想要的效果。"

                # Store fetched images in session for later use
                session.fetched_instagram_images = images
            else:
                msg = result.get("error", "下載失敗")

            session.add_message("assistant", msg)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=msg,
                session_id=session.id,
                state=ConversationState.IDLE,
                action_taken="fetched_instagram" if result.get("success") else None,
                result=result,
            )

        elif intent == "add_base_image":
            logger.info("=== Handling add_base_image intent ===")
            if not character_id:
                logger.warning("No character_id provided for add_base_image")
                msg = "請先選擇一個角色再添加 Base Image。"
                session.add_message("assistant", msg)
                return AgentChatResponse(
                    message=msg,
                    session_id=session.id,
                    state=ConversationState.IDLE,
                )

            image_url = parameters.get("image_url")
            logger.info(f"Image URL from parameters: {image_url}")
            if not image_url:
                logger.warning("No image_url in parameters")
                msg = "請提供要添加的圖片 URL。"
                session.add_message("assistant", msg)
                return AgentChatResponse(
                    message=msg,
                    session_id=session.id,
                    state=ConversationState.IDLE,
                )

            logger.info(f"Calling character_skill.add_base_image with URL: {image_url}")
            result = await self.character_skill.execute(
                action="add_base_image",
                params={"image_url": image_url},
                character_id=character_id,
                db=db,
            )
            logger.info(f"add_base_image result: {result}")
            msg = result.get("message", response_message)
            if not result.get("success"):
                msg = result.get("error", "添加失敗")
            session.add_message("assistant", msg)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=msg,
                session_id=session.id,
                state=ConversationState.IDLE,
                action_taken="added_base_image" if result.get("success") else None,
                result=result,
            )

        else:
            # Default fallback
            session.add_message("assistant", response_message)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=response_message,
                session_id=session.id,
                state=ConversationState.IDLE,
            )

    async def confirm_generation(
        self,
        session_id: str,
        aspect_ratio: str,
        modifications: Optional[str],
        db: AsyncSession,
        edited_prompt: Optional[str] = None,
        character_id: Optional[str] = None,
        pending_generation: Optional[PendingGeneration] = None,
    ) -> AgentChatResponse:
        """Confirm and start background generation (non-blocking)."""
        session = self.sessions.get(session_id)

        # If session not found but we have pending_generation from request, create a new session
        if not session and pending_generation and character_id:
            session = self._get_or_create_session(session_id, character_id)
            session.pending_generation = pending_generation

        if not session:
            return AgentChatResponse(
                message="Session not found",
                session_id=session_id,
                state=ConversationState.IDLE,
            )

        # Use character_id from request if session doesn't have one
        if character_id and not session.character_id:
            session.character_id = character_id

        pending = session.pending_generation
        if not pending:
            return AgentChatResponse(
                message="沒有待確認的生成任務",
                session_id=session_id,
                state=ConversationState.IDLE,
            )

        # If there are modifications, re-analyze
        if modifications:
            session.add_message("user", modifications)
            return await self.process_message(
                message=modifications,
                character_id=session.character_id,
                session_id=session_id,
                reference_image_path=None,
                db=db,
            )

        # Use edited_prompt if provided, otherwise use pending.optimized_prompt
        final_prompt = edited_prompt if edited_prompt else pending.optimized_prompt

        # Check if we have base images
        context = await self._build_context(session.character_id, db)
        has_base_images = context.get("base_image_count", 0) > 0

        # Create a background task
        task_id = str(uuid.uuid4())
        task = GenerationTask(
            task_id=task_id,
            status=GenerationTaskStatus.PENDING,
            progress=0,
            stage="preparing",
            prompt=final_prompt,
            reference_image_url=pending.params.reference_image_path,
            created_at=datetime.utcnow().isoformat(),
        )
        session.active_tasks[task_id] = task

        # Clear pending and set state to IDLE (non-blocking)
        session.pending_generation = None
        session.state = ConversationState.IDLE

        # Start background task
        asyncio.create_task(
            self._run_generation_task(
                session_id=session_id,
                task_id=task_id,
                character_id=session.character_id,
                pending=pending,
                final_prompt=final_prompt,
                aspect_ratio=aspect_ratio,
                has_base_images=has_base_images,
            )
        )

        msg = "開始生成中... 您可以繼續對話，生成完成後會自動通知。"
        session.add_message("assistant", msg)
        return AgentChatResponse(
            message=msg,
            session_id=session_id,
            state=ConversationState.IDLE,
            active_task=task,
        )

    async def _run_generation_task(
        self,
        session_id: str,
        task_id: str,
        character_id: str,
        pending: PendingGeneration,
        final_prompt: str,
        aspect_ratio: str,
        has_base_images: bool,
    ):
        """Run generation in background."""
        from app.models.image import Image, ImageType, ImageStatus

        session = self.sessions.get(session_id)
        if not session or task_id not in session.active_tasks:
            logger.error(f"Session or task not found: {session_id}/{task_id}")
            return

        task = session.active_tasks[task_id]
        task.status = GenerationTaskStatus.GENERATING
        task.stage = "generating"
        task.progress = 10

        try:
            # Create a new database session for background task
            async with async_session() as db:
                # Execute generation
                if pending.skill == "image_generator":
                    content_type = pending.params.content_type or "content_post"

                    task.stage = "generating image"
                    task.progress = 20

                    # Determine image type
                    is_base_image = content_type == "base"
                    image_type = ImageType.BASE if is_base_image else ImageType.CONTENT

                    # Create image record with "generating" status first
                    image = Image(
                        character_id=character_id,
                        type=image_type,
                        status=ImageStatus.GENERATING,
                        task_id=task_id,
                        is_approved=False,
                        metadata_json=json.dumps({
                            "prompt": final_prompt,
                            "style": pending.params.style,
                            "cloth": pending.params.cloth,
                        }),
                    )
                    db.add(image)
                    await db.commit()
                    await db.refresh(image)
                    existing_image_id = image.id
                    logger.info(f"Created generating image record: {existing_image_id}")

                    # If no base images and trying content_post, generate base image instead
                    if is_base_image:
                        result = await self.image_generator.execute(
                            action="generate_base",
                            params={
                                "prompt": final_prompt,
                                "aspect_ratio": aspect_ratio,
                                "existing_image_id": existing_image_id,
                            },
                            character_id=character_id,
                            db=db,
                        )
                        if result.get("success"):
                            result["message"] = "Base Image 生成成功！請在左側確認後，才能生成內容圖片。"
                    else:
                        result = await self.image_generator.generate_content(
                            character_id=character_id,
                            prompt=final_prompt,
                            aspect_ratio=aspect_ratio,
                            style=pending.params.style,
                            cloth=pending.params.cloth,
                            reference_image_path=pending.params.reference_image_path,
                            db=db,
                            existing_image_id=existing_image_id,
                        )

                elif pending.skill == "video_generator":
                    task.stage = "generating video"
                    task.progress = 20

                    # Video requires base images first
                    if not has_base_images:
                        # Generate base image first
                        result = await self.image_generator.execute(
                            action="generate_base",
                            params={
                                "prompt": final_prompt,
                                "aspect_ratio": aspect_ratio,
                            },
                            character_id=character_id,
                            db=db,
                        )
                        if result.get("success"):
                            result["message"] = "先生成了 Base Image，請確認後再次嘗試生成視頻。"
                    else:
                        result = await self.video_generator.execute(
                            action="generate_with_image",
                            params={
                                "image_prompt": final_prompt,
                                "video_prompt": "natural movement, slight motion",
                                "aspect_ratio": aspect_ratio,
                                "style": pending.params.style,
                                "cloth": pending.params.cloth,
                            },
                            character_id=character_id,
                            db=db,
                        )
                else:
                    result = {"success": False, "error": "Unknown skill"}

                # Update task status based on result
                task.progress = 100
                if result.get("success"):
                    task.status = GenerationTaskStatus.COMPLETED
                    task.stage = "completed"
                    task.result_url = result.get("image_url") or result.get("video_url")
                    logger.info(f"Task {task_id} completed successfully")
                else:
                    task.status = GenerationTaskStatus.FAILED
                    task.stage = "failed"
                    task.error = result.get("error", "Unknown error")
                    logger.error(f"Task {task_id} failed: {task.error}")

        except Exception as e:
            logger.exception(f"Background task {task_id} failed with exception")
            task.status = GenerationTaskStatus.FAILED
            task.stage = "failed"
            task.error = str(e)
            task.progress = 0

    def get_task(self, session_id: str, task_id: str) -> Optional[GenerationTask]:
        """Get a task by session and task ID."""
        session = self.sessions.get(session_id)
        if not session:
            return None
        return session.active_tasks.get(task_id)

    def _detect_edit_type_simple(self, message: str) -> str:
        """Simple edit type detection without GPT."""
        message_lower = message.lower()
        keywords = {
            "background": ["背景", "background", "場景", "環境"],
            "outfit": ["服裝", "衣服", "穿著", "outfit", "cloth", "dress"],
            "style": ["風格", "style", "轉換", "transform", "動漫", "anime"],
            "remove": ["移除", "刪除", "去掉", "remove", "delete"],
            "add": ["添加", "加上", "新增", "add", "put"],
            "replace": ["換成", "替換", "改成", "replace", "change"],
        }
        for edit_type, kws in keywords.items():
            for kw in kws:
                if kw in message_lower:
                    return edit_type
        return "modify"

    async def _analyze_edit_intent(
        self,
        message: str,
    ) -> dict[str, Any]:
        """Use GPT to analyze edit intent."""
        messages = [
            {"role": "user", "content": IMAGE_EDIT_SYSTEM_PROMPT},
            {"role": "user", "content": f"用戶的編輯指令: {message}"},
        ]

        try:
            result = await self.gpt_client.chat_reasoning_json(
                messages=messages,
                max_tokens=1000,
            )

            # Check if GPT refused
            response_msg = result.get("response_message", "").lower()
            refusal_indicators = ["cannot", "can't", "unable", "sorry", "policy"]
            if any(ind in response_msg for ind in refusal_indicators):
                raise ValueError("GPT refused")

            return result
        except Exception as e:
            logger.warning(f"Edit intent analysis failed: {e}, using fallback")
            # Fallback: simple detection
            edit_type = self._detect_edit_type_simple(message)
            return {
                "edit_type": edit_type,
                "reasoning": "使用本地分析",
                "response_message": f"好的，我來幫你{message}。請確認下方的編輯設定。",
                "suggestions": ["換成其他背景", "調整服裝", "改變風格"],
            }

    async def process_edit_message(
        self,
        message: str,
        source_image_path: str,
        character_id: Optional[str],
        session_id: Optional[str],
        db: AsyncSession,
    ) -> AgentChatResponse:
        """Process an image edit message and return response."""
        session = self._get_or_create_session(session_id, character_id)
        session.add_message("user", message)
        session.state = ConversationState.UNDERSTANDING

        # Analyze edit intent
        session.state = ConversationState.PLANNING
        intent_result = await self._analyze_edit_intent(message)

        edit_type = intent_result.get("edit_type", "modify")
        reasoning = intent_result.get("reasoning", "")
        response_message = intent_result.get("response_message", "")
        suggestions = intent_result.get("suggestions", [])

        # Optimize the edit prompt
        optimized_prompt, detected_type, analysis = await self.edit_prompt_optimizer.optimize(
            edit_instruction=message,
            source_image_path=source_image_path,
            edit_type=edit_type,
            db=db,
        )

        # Create pending edit
        session.pending_edit = PendingEdit(
            skill="image_editor",
            params=PendingEditParams(
                source_image_path=source_image_path,
                edit_type=detected_type,
                edit_instruction=message,
            ),
            optimized_prompt=optimized_prompt,
            reasoning=reasoning or analysis,
            suggestions=suggestions if suggestions else [
                "換成其他背景",
                "調整服裝風格",
                "改變光線氛圍",
            ],
        )
        session.state = ConversationState.AWAITING_CONFIRMATION

        session.add_message("assistant", response_message)
        return AgentChatResponse(
            message=response_message,
            session_id=session.id,
            state=ConversationState.AWAITING_CONFIRMATION,
            pending_edit=session.pending_edit,
        )

    async def confirm_edit(
        self,
        session_id: str,
        aspect_ratio: str,
        db: AsyncSession,
        edited_prompt: Optional[str] = None,
        character_id: Optional[str] = None,
        pending_edit: Optional[PendingEdit] = None,
    ) -> AgentChatResponse:
        """Confirm and execute pending image edit."""
        session = self.sessions.get(session_id)

        # If session not found but we have pending_edit from request, create a new session
        if not session and pending_edit and character_id:
            session = self._get_or_create_session(session_id, character_id)
            session.pending_edit = pending_edit

        if not session:
            return AgentChatResponse(
                message="Session not found",
                session_id=session_id,
                state=ConversationState.IDLE,
            )

        # Use character_id from request if session doesn't have one
        if character_id and not session.character_id:
            session.character_id = character_id

        pending = session.pending_edit
        if not pending:
            return AgentChatResponse(
                message="沒有待確認的編輯任務",
                session_id=session_id,
                state=ConversationState.IDLE,
            )

        if not session.character_id:
            return AgentChatResponse(
                message="請先選擇一個角色",
                session_id=session_id,
                state=ConversationState.IDLE,
            )

        session.state = ConversationState.EXECUTING

        # Use edited_prompt if provided, otherwise use pending.optimized_prompt
        final_prompt = edited_prompt if edited_prompt else pending.optimized_prompt

        # Execute the edit
        result = await self.image_editor.edit(
            character_id=session.character_id,
            prompt=final_prompt,
            source_image_path=pending.params.source_image_path,
            aspect_ratio=aspect_ratio,
            edit_type=pending.params.edit_type,
            edit_instruction=pending.params.edit_instruction,
            additional_reference_path=pending.params.additional_reference_path,
            db=db,
        )

        # Clear pending and update state
        session.pending_edit = None
        session.state = ConversationState.IDLE

        if result.get("success"):
            msg = result.get("message", "圖片編輯成功！")
            action = "edited_image"
        else:
            msg = f"編輯失敗: {result.get('error', 'Unknown error')}"
            action = None

        session.add_message("assistant", msg)
        return AgentChatResponse(
            message=msg,
            session_id=session_id,
            state=ConversationState.IDLE,
            action_taken=action,
            result=result,
        )

    def cancel_pending(self, session_id: str):
        """Cancel pending generation or edit."""
        session = self.sessions.get(session_id)
        if session:
            session.pending_generation = None
            session.pending_edit = None
            session.state = ConversationState.IDLE

    def clear_session(self, session_id: str):
        """Clear a session's conversation history."""
        if session_id in self.sessions:
            del self.sessions[session_id]


# Singleton
_agent: Optional[Agent] = None


def get_agent() -> Agent:
    """Get agent instance."""
    global _agent
    if _agent is None:
        _agent = Agent()
    return _agent
