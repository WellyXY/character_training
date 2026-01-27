"""Image schemas."""
from datetime import datetime
from typing import Optional, Any, Literal
from enum import Enum

from pydantic import BaseModel, Field


class ImageType(str, Enum):
    """Image type."""
    BASE = "base"
    SCENE = "scene"
    REFERENCE_OUTPUT = "reference_output"
    CONTENT = "content"


class ImageStatus(str, Enum):
    """Image generation status."""
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"


class AspectRatio(str, Enum):
    """Aspect ratio options."""
    PORTRAIT = "9:16"
    SQUARE = "1:1"
    LANDSCAPE = "16:9"


class Style(str, Enum):
    """Style options."""
    SEXY = "sexy"
    EXPOSED = "exposed"
    EROTIC = "erotic"
    HOME = "home"
    WARM = "warm"
    CUTE = "cute"


class Cloth(str, Enum):
    """Clothing options."""
    AUTUMN_WINTER = "autumn_winter"
    SPORTS = "sports"
    SEXY_LINGERIE = "sexy_lingerie"
    SEXY_UNDERWEAR = "sexy_underwear"
    NUDE = "nude"
    HOME_WEAR = "home_wear"
    DAILY = "daily"
    FASHION = "fashion"


class ImageMetadata(BaseModel):
    """Image generation metadata."""
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    guidance_scale: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    reference_image_ids: Optional[list[str]] = None
    style: Optional[str] = None
    cloth: Optional[str] = None
    # Reference tracking fields
    base_image_count: Optional[int] = None
    total_reference_count: Optional[int] = None
    user_reference_path: Optional[str] = None
    user_reference_passed_to_seedream: Optional[bool] = None


class ImageResponse(BaseModel):
    """Image response."""
    id: str
    character_id: str
    type: ImageType
    status: ImageStatus = ImageStatus.COMPLETED
    image_url: Optional[str] = None  # Nullable for generating state
    task_id: Optional[str] = None
    pose: Optional[str] = None
    expression: Optional[str] = None
    metadata: ImageMetadata = Field(default_factory=ImageMetadata)
    consistency_score: Optional[float] = None
    is_approved: bool
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class GenerationRequest(BaseModel):
    """Base image generation request."""
    prompt: Optional[str] = None
    scene_description: Optional[str] = None
    style: Optional[Style] = None
    cloth: Optional[Cloth] = None
    aspect_ratio: AspectRatio = AspectRatio.PORTRAIT
    count: int = Field(default=1, ge=1, le=4)
    base_image_ids: Optional[list[str]] = None


class GenerationResponse(BaseModel):
    """Generation response."""
    task_id: str
    images: list[ImageResponse] = Field(default_factory=list)
