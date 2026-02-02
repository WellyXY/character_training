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
from app.clients.gemini import get_gemini_client, GeminiClient
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
AGENT_SYSTEM_PROMPT = """You are an AI character content generation assistant. Your task is to understand user requests and decide what action to take.

## Available Functions:

1. **generate_image** - Generate an image
   - content_type:
     - "base" - Create a character base image, used to establish the character's appearance identity
     - "content_post" - Generate content images, referencing the character's base images
   - style: sexy, cute, warm, home, exposed, erotic
   - cloth: daily, fashion, sexy_lingerie, sexy_underwear, home_wear, sports, nude
   - scene_description: Scene description

2. **generate_video** - Generate a video (will first generate an image then convert to video)
   - Same parameters as generate_image
   - video_prompt: Video action description

3. **create_character** - Create a new character
   - name: Character name
   - description: Character description
   - gender: Gender

4. **update_character** - Update character information

5. **add_base_image** - Add an existing image as a base image for the character (does not generate a new image)
   - image_url: Image URL (required, the image link provided by the user)
   - Use this function when the user says "use this image as a base image" and provides a URL

6. **list_characters** - List all characters

7. **general_chat** - General conversation, no action required

8. **fetch_instagram** - Download reference images from an Instagram post
   - url: Instagram post URL (e.g. https://www.instagram.com/p/ABC123/)

## Response Format:

Respond in JSON format with the following fields:
```json
{
  "intent": "generate_image | generate_video | create_character | update_character | add_base_image | list_characters | general_chat | fetch_instagram",
  "reasoning": "Your reasoning process, explaining why you chose this intent",
  "parameters": {
    // Fill in the corresponding parameters based on intent
  },
  "needs_confirmation": true,  // Generation operations require confirmation, others do not
  "response_message": "Response message to the user"
}
```

## Important Rules:

1. When generating images or videos, you must set needs_confirmation: true
2. If the user has not selected a character, remind them to select one first
3. **Very Important**: If the number of Base Images is 0, you should:
   - Set content_type: "base" to generate a base image first
   - Tell the user in response_message: "I'll first generate a Base Image to establish the character's appearance"
4. Only use content_type: "content_post" when Base Images count > 0
5. Video only supports image-to-video, it will automatically generate an image first
6. Respond to the user in natural, friendly English
7. **When to use add_base_image**: When the user provides an image URL and says to "use as base image", "set as base image", or "add to base images", use the add_base_image intent and put the URL in parameters.image_url
8. **Reference image handling**: When "Reference Image" shows as "Yes":
   - The user has already uploaded a reference image, no need to ask for one
   - Use the generate_image intent directly
   - Handle according to the reference mode:
     * Face Only: Keep the pose, background, and outfit (including nudity state) from the reference, only replace the character's face
     * Pose & Background: Reference the pose and background, adjust outfit based on user description
     * Clothing & Pose: Reference the outfit and pose, adjust background based on user description
     * Custom: Freely reference based on user message
   - Describe the content to generate in scene_description, no need to ask the user for images
"""


# System prompt for image editing
IMAGE_EDIT_SYSTEM_PROMPT = """You are an AI image editing assistant. The user will provide an image and editing instructions. You need to understand the editing intent and generate an appropriate response.

## Edit Types:

1. **background** - Change background: Replace the image background, keep the person unchanged
2. **outfit** - Change outfit: Replace clothing, keep face and pose unchanged
3. **style** - Style transfer: Change overall style (e.g. anime, oil painting, etc.)
4. **remove** - Remove element: Remove an element from the image
5. **add** - Add element: Add an element to the image
6. **replace** - Replace element: Replace an existing element with a new one
7. **modify** - General modification: Other types of modifications

## Response Format:

Respond in JSON format:
```json
{
  "edit_type": "background | outfit | style | remove | add | replace | modify",
  "reasoning": "Your understanding and analysis",
  "response_message": "A friendly English response to the user, explaining what you understood and are about to execute",
  "suggestions": ["Other possible edit suggestion 1", "Suggestion 2", "Suggestion 3"]
}
```

## Important Rules:
1. Accurately identify the edit type
2. Respond in friendly English
3. Provide 2-3 related editing suggestions
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
        self.gemini_client = get_gemini_client()
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
        reference_image_info = "None"
        if context.get('reference_image_path'):
            mode = context.get('reference_image_mode', 'custom')
            mode_display = {
                'face_swap': 'Face Only',
                'pose_background': 'Pose & Background',
                'clothing_pose': 'Clothing & Pose',
                'custom': 'Custom',
            }.get(mode, mode)
            reference_image_info = f"Yes (user uploaded a reference image, mode: {mode_display})"
        context_msg = f"""
Current State:
- Selected Character: {context.get('character_name', 'Not selected')}
- Character ID: {context.get('character_id', 'N/A')}
- Base Images Count: {context.get('base_image_count', 0)}
- Character Description: {context.get('character_description', 'N/A')}
- Reference Image: {reference_image_info}
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
                "reasoning": "Locally detected Instagram URL",
                "parameters": {"url": message},
                "needs_confirmation": False,
                "response_message": "Downloading reference images from Instagram...",
            }

        # Check for add_base_image intent
        base_image_keywords = ["base image", "base_image", "as base", "set as base", "add to base"]
        has_base_image_intent = any(kw in message_lower for kw in base_image_keywords)

        # Extract URL from message
        import re
        url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
        urls = re.findall(url_pattern, message)

        if has_base_image_intent and urls:
            return {
                "intent": "add_base_image",
                "reasoning": "Locally detected add base image intent",
                "parameters": {"image_url": urls[0]},
                "needs_confirmation": False,
                "response_message": "Adding the image as a Base Image...",
            }

        # Check for image generation keywords
        image_keywords = ["image", "photo", "generate", "create", "picture", "shoot", "selfie"]
        video_keywords = ["video", "clip", "vlog", "dance"]

        is_image = any(kw in message_lower for kw in image_keywords)
        is_video = any(kw in message_lower for kw in video_keywords)

        # Detect style/cloth from message
        style = None
        cloth = None
        if any(kw in message_lower for kw in ["sexy", "seductive", "sensual"]):
            style = "sexy"
        if any(kw in message_lower for kw in ["nude", "naked"]):
            cloth = "nude"
            style = "erotic"
        elif any(kw in message_lower for kw in ["lingerie", "underwear"]):
            cloth = "sexy_lingerie"

        if is_video:
            return {
                "intent": "generate_video",
                "reasoning": "Locally detected video generation intent",
                "parameters": {
                    "content_type": "content_post",
                    "style": style,
                    "cloth": cloth,
                    "scene_description": message,
                },
                "needs_confirmation": True,
                "response_message": "Sure, I'll generate a video for you. Please confirm the settings below:",
            }
        elif is_image:
            return {
                "intent": "generate_image",
                "reasoning": "Locally detected image generation intent",
                "parameters": {
                    "content_type": "content_post",
                    "style": style,
                    "cloth": cloth,
                    "scene_description": message,
                },
                "needs_confirmation": True,
                "response_message": "Sure, I'll generate an image for you. Please confirm the settings below:",
            }
        else:
            return {
                "intent": "general_chat",
                "reasoning": "Unable to identify intent",
                "parameters": {},
                "needs_confirmation": False,
                "response_message": "What kind of image or video would you like to generate?",
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
            result = await self.gemini_client.chat_reasoning_json(
                messages=messages,
                max_tokens=2000,
            )

            # Check if GPT refused (content policy)
            response_msg = result.get("response_message", "").lower()
            refusal_indicators = [
                "cannot", "can't", "unable", "sorry", "apologize",
                "policy", "inappropriate"
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
            "character_gender": None,
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
                context["character_gender"] = char.get("gender")
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
                "face_swap": "face swap using the reference image, keeping the original pose, background and outfit",
                "pose_background": "reference the pose and background from the image",
                "clothing_pose": "reference the clothing and pose from the image",
            }
            intent_result = {
                "intent": "generate_image",
                "reasoning": f"User uploaded a reference image and selected {reference_image_mode} mode",
                "parameters": {
                    "content_type": "content_post",
                    "scene_description": message if message.strip() else mode_descriptions.get(reference_image_mode, ""),
                },
                "needs_confirmation": True,
                "response_message": f"Sure, I'll {mode_descriptions.get(reference_image_mode, 'generate an image')} for you. Please confirm the settings below:",
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
            # Check if this is a content-policy refusal for a generation request
            refusal_kw = [
                # English
                "cannot", "can't", "unable", "sorry", "apologize", "policy", "inappropriate",
                # Chinese
                "抱歉", "無法", "不能", "對不起", "很遺憾", "不允許", "違反", "政策",
            ]
            is_refusal = any(kw in response_message.lower() for kw in refusal_kw)
            if is_refusal and character_id:
                # Still offer a generation card so the user can confirm directly
                fallback_prompt = self.prompt_optimizer._build_fallback_prompt(
                    raw_prompt=message,
                    style="",
                    cloth="",
                    character_description=context.get("character_description", ""),
                    has_reference_image=bool(reference_image_path),
                    reference_image_mode=reference_image_mode,
                )
                session.pending_generation = PendingGeneration(
                    skill="image_generator",
                    params=PendingGenerationParams(
                        content_type="content_post",
                        scene_description=message,
                        aspect_ratio="9:16",
                        reference_image_path=reference_image_path,
                        reference_image_mode=reference_image_mode,
                    ),
                    optimized_prompt=fallback_prompt,
                    reasoning="Content policy bypass — using user prompt directly",
                    suggestions=[
                        "Make it sexier",
                        "Change to home scene",
                        "Use a different outfit",
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

            session.add_message("assistant", response_message)
            session.state = ConversationState.IDLE
            return AgentChatResponse(
                message=response_message,
                session_id=session.id,
                state=ConversationState.IDLE,
            )

        elif intent in ("generate_image", "generate_video"):
            if not character_id:
                msg = "Please select a character first before generating."
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
                character_gender=context.get("character_gender"),
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
                    video_prompt=parameters.get("video_prompt"),
                ),
                optimized_prompt=optimized_prompt,
                reasoning=reasoning,
                suggestions=[
                    "Make it sexier",
                    "Change to home scene",
                    "Use a different outfit",
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
                msg = f"Existing characters:\n{char_list}"
            else:
                msg = "No characters found. Please create a new character to get started."
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
                msg = f"Downloaded {len(images)} reference images:\n{image_list}\n\nPlease tell me which one you'd like to use and the desired effect."

                # Store fetched images in session for later use
                session.fetched_instagram_images = images
            else:
                msg = result.get("error", "Download failed")

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
                msg = "Please select a character first before adding a Base Image."
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
                msg = "Please provide the image URL to add."
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
                msg = result.get("error", "Failed to add")
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
                message="No pending generation task",
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

        msg = "Generation started... You can continue chatting, and you'll be notified when it's done."
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
                        image_url="",  # placeholder until generation completes
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
                                "reference_image_path": pending.params.reference_image_path,
                            },
                            character_id=character_id,
                            db=db,
                        )
                        if result.get("success"):
                            result["message"] = "Base Image generated successfully! Please approve it on the left before generating content images."
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
                            result["message"] = "A Base Image was generated first. Please approve it and then try generating the video again."
                    else:
                        result = await self.video_generator.execute(
                            action="generate_with_image",
                            params={
                                "image_prompt": final_prompt,
                                "video_prompt": pending.params.video_prompt or final_prompt,
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
            "background": ["background", "scene", "environment"],
            "outfit": ["outfit", "cloth", "dress", "clothing", "wear"],
            "style": ["style", "transform", "anime", "artistic"],
            "remove": ["remove", "delete", "erase"],
            "add": ["add", "put", "insert"],
            "replace": ["replace", "change", "swap"],
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
            {"role": "user", "content": f"User's edit instruction: {message}"},
        ]

        try:
            result = await self.gemini_client.chat_reasoning_json(
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
                "reasoning": "Using local analysis",
                "response_message": f"Sure, I'll help you {message}. Please confirm the edit settings below.",
                "suggestions": ["Change background", "Adjust outfit", "Change style"],
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
                "Change background",
                "Adjust outfit style",
                "Change lighting mood",
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
                message="No pending edit task",
                session_id=session_id,
                state=ConversationState.IDLE,
            )

        if not session.character_id:
            return AgentChatResponse(
                message="Please select a character first",
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
            msg = result.get("message", "Image edited successfully!")
            action = "edited_image"
        else:
            msg = f"Edit failed: {result.get('error', 'Unknown error')}"
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
