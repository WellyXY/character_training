"""Agent schemas."""
from __future__ import annotations
from typing import Optional, Any
from enum import Enum

from pydantic import BaseModel, Field


class ConversationState(str, Enum):
    """Conversation state."""
    IDLE = "idle"
    UNDERSTANDING = "understanding"
    PLANNING = "planning"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    EXECUTING = "executing"


class EditType(str, Enum):
    """Image edit types."""
    ADD = "add"
    REMOVE = "remove"
    REPLACE = "replace"
    MODIFY = "modify"
    STYLE = "style"
    BACKGROUND = "background"
    OUTFIT = "outfit"


class ReferenceImageMode(str, Enum):
    """Reference image mode for controlling how reference images are used."""
    FACE_SWAP = "face_swap"  # Keep pose, background, outfit from reference, only replace face
    POSE_BACKGROUND = "pose_background"  # Reference the pose and background composition
    CLOTHING_POSE = "clothing_pose"  # Reference the outfit and pose only
    CUSTOM = "custom"  # No preset - user describes in message


class Intent(str, Enum):
    """Agent intent types."""
    GENERATE_IMAGE = "generate_image"
    GENERATE_VIDEO = "generate_video"
    CREATE_CHARACTER = "create_character"
    UPDATE_CHARACTER = "update_character"
    ADD_BASE_IMAGE = "add_base_image"
    LIST_CHARACTERS = "list_characters"
    GENERAL_CHAT = "general_chat"


class PendingGenerationParams(BaseModel):
    """Parameters for pending generation."""
    content_type: Optional[str] = None
    style: Optional[str] = None
    cloth: Optional[str] = None
    scene_description: Optional[str] = None
    aspect_ratio: Optional[str] = "9:16"
    reference_image_path: Optional[str] = None  # User uploaded reference image
    reference_image_mode: Optional[ReferenceImageMode] = None  # How to use the reference image


class PendingGeneration(BaseModel):
    """Pending generation details."""
    skill: str
    params: PendingGenerationParams
    optimized_prompt: str
    reasoning: str
    suggestions: list[str] = Field(default_factory=list)


class AgentChatRequest(BaseModel):
    """Agent chat request."""
    message: str = Field(..., min_length=1)
    character_id: Optional[str] = None
    session_id: Optional[str] = None
    reference_image_path: Optional[str] = None
    reference_image_mode: Optional[ReferenceImageMode] = None


class AgentChatResponse(BaseModel):
    """Agent chat response."""
    message: str
    session_id: str
    state: ConversationState = ConversationState.IDLE
    pending_generation: Optional[PendingGeneration] = None
    pending_edit: Optional["PendingEdit"] = None
    action_taken: Optional[str] = None
    result: Optional[dict[str, Any]] = None
    active_task: Optional["GenerationTask"] = None  # Background generation task


class AgentConfirmRequest(BaseModel):
    """Agent confirm generation request."""
    session_id: str
    aspect_ratio: str = "9:16"
    modifications: Optional[str] = None
    edited_prompt: Optional[str] = None  # User-edited prompt override
    # Include these so confirmation works even if server restarts
    character_id: Optional[str] = None
    pending_generation: Optional[PendingGeneration] = None


class IntentAnalysis(BaseModel):
    """Intent analysis result from o1-mini."""
    intent: Intent
    reasoning: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    needs_confirmation: bool = True
    response_message: Optional[str] = None


# Image Edit schemas
class PendingEditParams(BaseModel):
    """Parameters for pending image edit."""
    source_image_path: str
    edit_type: Optional[EditType] = None
    edit_instruction: str
    additional_reference_path: Optional[str] = None


class PendingEdit(BaseModel):
    """Pending image edit details."""
    skill: str = "image_editor"
    params: PendingEditParams
    optimized_prompt: str
    reasoning: str
    suggestions: list[str] = Field(default_factory=list)


class ImageEditRequest(BaseModel):
    """Image edit chat request."""
    message: str = Field(..., min_length=1)
    source_image_path: str
    character_id: Optional[str] = None
    session_id: Optional[str] = None


class ImageEditConfirmRequest(BaseModel):
    """Image edit confirm request."""
    session_id: str
    aspect_ratio: str = "9:16"
    edited_prompt: Optional[str] = None  # User-edited prompt override
    character_id: Optional[str] = None
    pending_edit: Optional[PendingEdit] = None


class GenerationTaskStatus(str, Enum):
    """Generation task status."""
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class GenerationTask(BaseModel):
    """Background generation task status."""
    task_id: str
    status: GenerationTaskStatus = GenerationTaskStatus.PENDING
    progress: int = 0  # 0-100
    stage: str = ""  # "optimizing", "generating", "downloading", "saving"
    prompt: str = ""
    reference_image_url: Optional[str] = None
    result_url: Optional[str] = None
    error: Optional[str] = None
    created_at: str
