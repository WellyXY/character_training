"""Sample post schemas."""
from datetime import datetime
from typing import Optional, Any
from enum import Enum

from pydantic import BaseModel, Field


class MediaType(str, Enum):
    """Media type."""
    IMAGE = "image"
    VIDEO = "video"


class SamplePostCreate(BaseModel):
    """Request to create a sample post."""
    creator_name: str = Field(..., min_length=1, max_length=255)
    source_url: str = Field(..., max_length=2048)
    media_type: MediaType = MediaType.IMAGE
    media_url: str = Field(..., max_length=2048)
    thumbnail_url: str = Field(..., max_length=2048)
    caption: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None


class SamplePostUpdate(BaseModel):
    """Request to update a sample post."""
    creator_name: Optional[str] = Field(None, min_length=1, max_length=255)
    caption: Optional[str] = None
    tags: Optional[list[str]] = None
    metadata: Optional[dict[str, Any]] = None


class SamplePostResponse(BaseModel):
    """Sample post response."""
    id: str
    creator_name: str
    source_url: str
    media_type: MediaType
    media_url: str
    thumbnail_url: str
    caption: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SamplePostListParams(BaseModel):
    """Query parameters for listing samples."""
    tag: Optional[str] = None
    creator: Optional[str] = None
    media_type: Optional[MediaType] = None
    limit: int = Field(default=50, ge=1, le=200)
    offset: int = Field(default=0, ge=0)
