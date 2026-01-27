"""Character schemas."""
from datetime import datetime
from typing import Optional, Any
from enum import Enum

from pydantic import BaseModel, Field


class CharacterStatus(str, Enum):
    """Character status."""
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class CharacterProfile(BaseModel):
    """Character profile details."""
    facial: Optional[dict[str, Any]] = None
    body: Optional[dict[str, Any]] = None
    style: Optional[str] = None
    aura: Optional[str] = None
    age_appearance: Optional[str] = None
    gender: Optional[str] = None


class CharacterCreate(BaseModel):
    """Request to create a character."""
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="")
    gender: Optional[str] = None


class CharacterUpdate(BaseModel):
    """Request to update a character."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[CharacterStatus] = None


class CharacterResponse(BaseModel):
    """Character response."""
    id: str
    name: str
    description: str
    gender: Optional[str] = None
    profile: Optional[CharacterProfile] = None
    canonical_prompt_block: Optional[str] = None
    base_image_ids: list[str] = Field(default_factory=list)
    status: CharacterStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
