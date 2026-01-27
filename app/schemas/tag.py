"""Tag schemas."""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TagCreate(BaseModel):
    """Request to create a tag."""
    name: str = Field(..., min_length=1, max_length=100)


class TagResponse(BaseModel):
    """Tag response."""
    id: str
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class TagListResponse(BaseModel):
    """Response for listing tags."""
    tags: list[TagResponse]
    total: int


class SampleTagsUpdate(BaseModel):
    """Request to update tags for a sample post."""
    tags: list[str] = Field(default_factory=list, description="List of tag names")
