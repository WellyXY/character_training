"""Video schemas."""
from datetime import datetime
from typing import Optional, Any
from enum import Enum

from pydantic import BaseModel, Field


class VideoType(str, Enum):
    """Video type."""
    VLOG = "vlog"
    DANCE = "dance"
    LIPSYNC = "lipsync"


class VideoStatus(str, Enum):
    """Video status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class VideoMetadata(BaseModel):
    """Video generation metadata."""
    prompt: Optional[str] = None
    original_prompt: Optional[str] = None
    enhanced_prompt: Optional[str] = None
    style: Optional[str] = None
    cloth: Optional[str] = None
    content_type: Optional[str] = None
    source_image_id: Optional[str] = None
    audio_url: Optional[str] = None
    music_url: Optional[str] = None
    video_model: Optional[str] = None
    resolution: Optional[str] = None
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    progress: Optional[int] = None  # Video generation progress 0-100


class VideoResponse(BaseModel):
    """Video response."""
    id: str
    character_id: str
    type: VideoType
    video_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    duration: Optional[float] = None
    metadata: VideoMetadata = Field(default_factory=VideoMetadata)
    status: VideoStatus
    created_at: datetime

    class Config:
        from_attributes = True


class VideoGenerationRequest(BaseModel):
    """Video generation request."""
    source_image_url: str
    prompt: Optional[str] = None
    resolution: Optional[str] = None
    audio_url: Optional[str] = None


class VideoGenerationResponse(BaseModel):
    """Video generation response."""
    task_id: str
    videos: list[VideoResponse] = Field(default_factory=list)
