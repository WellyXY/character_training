"""Character management router."""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.character import Character, CharacterStatus as DBCharacterStatus
from app.models.image import Image, ImageType as DBImageType
from app.schemas.character import (
    CharacterCreate,
    CharacterUpdate,
    CharacterResponse,
    CharacterStatus,
)
from app.services.storage import get_storage_service, StorageService

router = APIRouter()


def _character_to_response(character: Character, base_image_ids: list[str]) -> CharacterResponse:
    """Convert Character model to response schema."""
    profile = None
    if character.profile_json:
        try:
            profile = json.loads(character.profile_json)
        except json.JSONDecodeError:
            pass

    return CharacterResponse(
        id=character.id,
        name=character.name,
        description=character.description,
        gender=character.gender,
        profile=profile,
        canonical_prompt_block=character.canonical_prompt_block,
        base_image_ids=base_image_ids,
        status=CharacterStatus(character.status.value),
        created_at=character.created_at,
        updated_at=character.updated_at,
    )


@router.get("/characters", response_model=list[CharacterResponse])
async def list_characters(db: AsyncSession = Depends(get_db)):
    """List all characters."""
    result = await db.execute(
        select(Character).order_by(Character.created_at.desc())
    )
    characters = result.scalars().all()

    responses = []
    for char in characters:
        # Get base image IDs
        img_result = await db.execute(
            select(Image.id)
            .where(Image.character_id == char.id)
            .where(Image.type == DBImageType.BASE)
            .where(Image.is_approved == True)
        )
        base_image_ids = [row[0] for row in img_result.fetchall()]
        responses.append(_character_to_response(char, base_image_ids))

    return responses


@router.post("/characters", response_model=CharacterResponse)
async def create_character(
    data: CharacterCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new character."""
    character = Character(
        name=data.name,
        description=data.description,
        gender=data.gender,
        status=DBCharacterStatus.DRAFT,
    )
    db.add(character)
    await db.commit()
    await db.refresh(character)

    return _character_to_response(character, [])


@router.get("/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a character by ID."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Get base image IDs
    img_result = await db.execute(
        select(Image.id)
        .where(Image.character_id == character.id)
        .where(Image.type == DBImageType.BASE)
        .where(Image.is_approved == True)
    )
    base_image_ids = [row[0] for row in img_result.fetchall()]

    return _character_to_response(character, base_image_ids)


@router.put("/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    data: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a character."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    if data.name is not None:
        character.name = data.name
    if data.description is not None:
        character.description = data.description
    if data.status is not None:
        character.status = DBCharacterStatus(data.status.value)

    await db.commit()
    await db.refresh(character)

    # Get base image IDs
    img_result = await db.execute(
        select(Image.id)
        .where(Image.character_id == character.id)
        .where(Image.type == DBImageType.BASE)
        .where(Image.is_approved == True)
    )
    base_image_ids = [row[0] for row in img_result.fetchall()]

    return _character_to_response(character, base_image_ids)


@router.delete("/characters/{character_id}")
async def delete_character(
    character_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a character."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    await db.delete(character)
    await db.commit()

    return {"status": "deleted"}


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    storage: StorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file."""
    result = await storage.save_upload(file, db)
    await db.commit()
    return result
