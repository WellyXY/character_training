"""Tags router for managing sample post tags."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tag import Tag, SamplePostTag
from app.schemas.tag import TagCreate, TagResponse, TagListResponse

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/tags", response_model=TagListResponse)
async def list_tags(
    db: AsyncSession = Depends(get_db),
    search: Optional[str] = Query(None, description="Search tags by name"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List all tags with optional search."""
    query = select(Tag).order_by(Tag.name)

    if search:
        query = query.where(Tag.name.ilike(f"%{search}%"))

    # Get total count
    count_query = select(func.count()).select_from(Tag)
    if search:
        count_query = count_query.where(Tag.name.ilike(f"%{search}%"))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    tags = result.scalars().all()

    return TagListResponse(
        tags=[TagResponse.model_validate(tag) for tag in tags],
        total=total,
    )


@router.post("/tags", response_model=TagResponse)
async def create_tag(
    data: TagCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new tag or return existing one if name already exists."""
    # Normalize tag name (lowercase, trimmed)
    normalized_name = data.name.strip().lower()

    if not normalized_name:
        raise HTTPException(status_code=400, detail="Tag name cannot be empty")

    # Check if tag already exists
    result = await db.execute(
        select(Tag).where(Tag.name == normalized_name)
    )
    existing_tag = result.scalar_one_or_none()

    if existing_tag:
        return TagResponse.model_validate(existing_tag)

    # Create new tag
    tag = Tag(name=normalized_name)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)

    return TagResponse.model_validate(tag)


@router.get("/tags/{tag_id}", response_model=TagResponse)
async def get_tag(
    tag_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a tag by ID."""
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id)
    )
    tag = result.scalar_one_or_none()

    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    return TagResponse.model_validate(tag)


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a tag. This will remove the tag from all sample posts."""
    result = await db.execute(
        select(Tag).where(Tag.id == tag_id)
    )
    tag = result.scalar_one_or_none()

    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    await db.delete(tag)
    await db.commit()

    return {"status": "deleted"}


async def get_or_create_tag(db: AsyncSession, tag_name: str) -> Tag:
    """Get an existing tag or create a new one."""
    normalized_name = tag_name.strip().lower()

    if not normalized_name:
        raise ValueError("Tag name cannot be empty")

    result = await db.execute(
        select(Tag).where(Tag.name == normalized_name)
    )
    tag = result.scalar_one_or_none()

    if tag:
        return tag

    # Create new tag
    tag = Tag(name=normalized_name)
    db.add(tag)
    await db.flush()  # Get the ID without committing

    return tag


async def sync_sample_tags(
    db: AsyncSession,
    sample_id: str,
    tag_names: list[str],
) -> list[Tag]:
    """
    Sync tags for a sample post.
    Creates any missing tags and updates the junction table.
    Returns the list of Tag objects.
    """
    # Get or create all tags
    tags = []
    for name in tag_names:
        normalized = name.strip().lower()
        if normalized:
            tag = await get_or_create_tag(db, normalized)
            tags.append(tag)

    # Remove existing associations
    await db.execute(
        SamplePostTag.__table__.delete().where(
            SamplePostTag.sample_post_id == sample_id
        )
    )

    # Create new associations
    for tag in tags:
        db.add(SamplePostTag(sample_post_id=sample_id, tag_id=tag.id))

    return tags
