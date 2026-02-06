"""Character management router."""
import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.character import Character, CharacterStatus as DBCharacterStatus
from app.models.image import Image, ImageType as DBImageType, ImageStatus as DBImageStatus
from app.models.user import User
from app.schemas.character import (
    CharacterCreate,
    CharacterUpdate,
    CharacterResponse,
    CharacterStatus,
)
from app.services.storage import get_storage_service, StorageService
from app.auth import get_current_user
from app.services.tokens import deduct_tokens, refund_tokens

logger = logging.getLogger(__name__)

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
async def list_characters(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all characters for the current user."""
    result = await db.execute(
        select(Character)
        .where(Character.user_id == current_user.id)
        .order_by(Character.created_at.desc())
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
    current_user: User = Depends(get_current_user),
):
    """Create a new character for the current user."""
    character = Character(
        name=data.name,
        description=data.description,
        gender=data.gender,
        status=DBCharacterStatus.DRAFT,
        user_id=current_user.id,
    )
    db.add(character)
    await db.commit()
    await db.refresh(character)

    return _character_to_response(character, [])


@router.get("/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a character by ID (must belong to current user)."""
    result = await db.execute(
        select(Character)
        .where(Character.id == character_id)
        .where(Character.user_id == current_user.id)
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
    current_user: User = Depends(get_current_user),
):
    """Update a character (must belong to current user)."""
    result = await db.execute(
        select(Character)
        .where(Character.id == character_id)
        .where(Character.user_id == current_user.id)
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
    current_user: User = Depends(get_current_user),
):
    """Delete a character (must belong to current user)."""
    result = await db.execute(
        select(Character)
        .where(Character.id == character_id)
        .where(Character.user_id == current_user.id)
    )
    character = result.scalar_one_or_none()

    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    await db.delete(character)
    await db.commit()

    return {"status": "deleted"}


class GenerateBaseImagesRequest(BaseModel):
    """Request to generate base images for a character."""
    reference_image_paths: Optional[list[str]] = None


class BaseImageTask(BaseModel):
    """A single base image generation task."""
    task_id: str
    prompt: str


class GenerateBaseImagesResponse(BaseModel):
    """Response with task info for base image generation."""
    tasks: list[BaseImageTask]


async def _generate_single_base_image(
    character_id: str,
    image_id: str,
    prompt: str,
    user_id: str,
    reference_image_paths: Optional[list[str]] = None,
):
    """Background task: generate one base image and auto-approve it."""
    from app.agent.skills.image_generator import ImageGeneratorSkill

    skill = ImageGeneratorSkill()
    async with async_session() as db:
        try:
            result = await skill.execute(
                action="generate_base",
                params={
                    "prompt": prompt,
                    "aspect_ratio": "1:1",
                    "existing_image_id": image_id,
                    "reference_image_paths": reference_image_paths,
                },
                character_id=character_id,
                db=db,
            )
            if result.get("success"):
                # Auto-approve
                from sqlalchemy import select as sel
                res = await db.execute(sel(Image).where(Image.id == image_id))
                image = res.scalar_one_or_none()
                if image:
                    image.is_approved = True
                    await db.commit()
                logger.info(f"Base image {image_id} generated and auto-approved")
            else:
                logger.error(f"Base image {image_id} generation failed: {result.get('error')}")
                # Refund token on failure
                from app.models.user import User as UserModel
                user_res = await db.execute(sel(UserModel).where(UserModel.id == user_id))
                user = user_res.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "image_generation", db, image_id)
                    await db.commit()
        except Exception as e:
            logger.error(f"Base image {image_id} generation error: {e}")
            try:
                from sqlalchemy import select as sel
                res = await db.execute(sel(Image).where(Image.id == image_id))
                image = res.scalar_one_or_none()
                if image:
                    image.status = DBImageStatus.FAILED
                    image.error_message = str(e)
                # Refund token on failure
                from app.models.user import User as UserModel
                user_res = await db.execute(sel(UserModel).where(UserModel.id == user_id))
                user = user_res.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "image_generation", db, image_id)
                await db.commit()
            except Exception:
                pass


@router.post("/characters/{character_id}/generate-base-images", response_model=GenerateBaseImagesResponse)
async def generate_base_images(
    character_id: str,
    data: GenerateBaseImagesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate 3 base images for a character (white t-shirt, white bg, different poses)."""
    # Verify character exists and belongs to user
    result = await db.execute(
        select(Character)
        .where(Character.id == character_id)
        .where(Character.user_id == current_user.id)
    )
    character = result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    description = character.description or character.name
    gender = character.gender or "person"

    prompts = [
        f"A photorealistic portrait of a {gender}, {description}, wearing a plain white t-shirt, standing against a clean white background, facing directly forward, neutral expression, even studio lighting, half-body shot",
        f"A photorealistic portrait of a {gender}, {description}, wearing a plain white t-shirt, standing against a clean white background, turned slightly to the left at a three-quarter angle, gentle smile, soft studio lighting, half-body shot",
        f"A photorealistic portrait of a {gender}, {description}, wearing a plain white t-shirt, standing against a clean white background, slight side angle looking over shoulder, natural expression, even studio lighting, half-body shot",
    ]

    # Check and deduct tokens for all 3 images upfront (3 tokens total)
    total_cost = len(prompts)  # 1 token per image
    if current_user.token_balance < total_cost:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "insufficient_tokens",
                "message": f"Insufficient tokens. Required: {total_cost}, Available: {current_user.token_balance}",
                "required": total_cost,
                "available": current_user.token_balance,
            }
        )

    tasks = []
    for prompt in prompts:
        task_id = f"base-{uuid.uuid4().hex[:8]}"
        # Create image record with GENERATING status
        image = Image(
            character_id=character_id,
            type=DBImageType.BASE,
            status=DBImageStatus.GENERATING,
            task_id=task_id,
            image_url="",
            is_approved=False,
            metadata_json=json.dumps({"prompt": prompt}),
        )
        db.add(image)
        await db.commit()
        await db.refresh(image)

        # Deduct token for this image
        await deduct_tokens(current_user, "image_generation", db, image.id)
        await db.commit()

        # Spawn background generation
        asyncio.create_task(
            _generate_single_base_image(
                character_id=character_id,
                image_id=image.id,
                prompt=prompt,
                user_id=current_user.id,
                reference_image_paths=data.reference_image_paths,
            )
        )

        tasks.append(BaseImageTask(task_id=task_id, prompt=prompt))

    return GenerateBaseImagesResponse(tasks=tasks)


@router.post("/uploads")
async def upload_file(
    file: UploadFile = File(...),
    storage: StorageService = Depends(get_storage_service),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file (requires authentication)."""
    result = await storage.save_upload(file, db)
    await db.commit()
    return result
