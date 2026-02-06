"""Image management router."""
import asyncio
import json
import logging
import uuid
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, async_session
from app.models.image import Image, ImageType as DBImageType, ImageStatus as DBImageStatus
from app.models.character import Character
from app.models.user import User
from app.schemas.image import ImageResponse, ImageMetadata, ImageType, ImageStatus
from app.agent.skills.image_generator import ImageGeneratorSkill
from app.auth import get_current_user
from app.services.tokens import deduct_tokens, refund_tokens

logger = logging.getLogger(__name__)

router = APIRouter()


def _image_to_response(image: Image) -> ImageResponse:
    """Convert Image model to response schema."""
    from app.models.image import ImageStatus as DBImageStatus

    metadata = ImageMetadata()
    if image.metadata_json:
        try:
            metadata_dict = json.loads(image.metadata_json)
            metadata = ImageMetadata(**metadata_dict)
        except (json.JSONDecodeError, TypeError):
            pass

    # Convert status with fallback for legacy records
    status = ImageStatus.COMPLETED
    if hasattr(image, 'status') and image.status:
        try:
            status = ImageStatus(image.status.value)
        except (ValueError, AttributeError):
            status = ImageStatus.COMPLETED

    return ImageResponse(
        id=image.id,
        character_id=image.character_id,
        type=ImageType(image.type.value),
        status=status,
        image_url=image.image_url,
        task_id=getattr(image, 'task_id', None),
        pose=image.pose,
        expression=image.expression,
        metadata=metadata,
        consistency_score=image.consistency_score,
        is_approved=image.is_approved,
        error_message=getattr(image, 'error_message', None),
        created_at=image.created_at,
    )


@router.get("/characters/{character_id}/images", response_model=list[ImageResponse])
async def list_character_images(
    character_id: str,
    image_type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List images for a character (must belong to current user, or any if admin)."""
    # Verify character exists and belongs to user (or admin)
    if current_user.is_admin:
        char_result = await db.execute(
            select(Character).where(Character.id == character_id)
        )
    else:
        char_result = await db.execute(
            select(Character)
            .where(Character.id == character_id)
            .where(Character.user_id == current_user.id)
        )
    if not char_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Character not found")

    query = select(Image).where(Image.character_id == character_id)

    if image_type:
        try:
            db_type = DBImageType(image_type)
            query = query.where(Image.type == db_type)
        except ValueError:
            pass

    query = query.order_by(Image.created_at.desc())
    result = await db.execute(query)
    images = result.scalars().all()

    return [_image_to_response(img) for img in images]


@router.get("/images/{image_id}", response_model=ImageResponse)
async def get_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get an image by ID (character must belong to current user, or any if admin)."""
    if current_user.is_admin:
        result = await db.execute(
            select(Image).where(Image.id == image_id)
        )
    else:
        result = await db.execute(
            select(Image)
            .join(Character)
            .where(Image.id == image_id)
            .where(Character.user_id == current_user.id)
        )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return _image_to_response(image)


@router.post("/images/{image_id}/approve", response_model=ImageResponse)
async def approve_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve an image (character must belong to current user)."""
    result = await db.execute(
        select(Image)
        .join(Character)
        .where(Image.id == image_id)
        .where(Character.user_id == current_user.id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Check base image limit (max 3)
    if image.type == DBImageType.BASE and not image.is_approved:
        count_result = await db.execute(
            select(Image)
            .where(Image.character_id == image.character_id)
            .where(Image.type == DBImageType.BASE)
            .where(Image.is_approved == True)
        )
        approved_count = len(count_result.scalars().all())
        if approved_count >= 3:
            raise HTTPException(
                status_code=400,
                detail="Maximum 3 base images allowed per character"
            )

    image.is_approved = True
    await db.commit()
    await db.refresh(image)

    return _image_to_response(image)


@router.post("/images/{image_id}/set-as-base", response_model=ImageResponse)
async def set_as_base(
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set an image as base (character must belong to current user)."""
    result = await db.execute(
        select(Image)
        .join(Character)
        .where(Image.id == image_id)
        .where(Character.user_id == current_user.id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    if image.type == DBImageType.BASE:
        # Already a base image, just ensure approved
        image.is_approved = True
        await db.commit()
        await db.refresh(image)
        return _image_to_response(image)

    # Get current approved base images ordered by creation date
    base_result = await db.execute(
        select(Image)
        .where(Image.character_id == image.character_id)
        .where(Image.type == DBImageType.BASE)
        .where(Image.is_approved == True)
        .order_by(Image.created_at.desc())
    )
    approved_bases = base_result.scalars().all()

    # If at the limit, delete the oldest (last in desc order)
    if len(approved_bases) >= 3:
        oldest = approved_bases[-1]
        await db.delete(oldest)

    # Set current image as base and approve
    image.type = DBImageType.BASE
    image.is_approved = True
    await db.commit()
    await db.refresh(image)

    return _image_to_response(image)


@router.delete("/images/{image_id}")
async def delete_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an image (character must belong to current user)."""
    result = await db.execute(
        select(Image)
        .join(Character)
        .where(Image.id == image_id)
        .where(Character.user_id == current_user.id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    await db.delete(image)
    await db.commit()

    return {"status": "deleted"}


async def _retry_image_background(
    character_id: str,
    image_id: str,
    image_type: str,
    prompt: str,
    aspect_ratio: str,
    params: dict[str, Any],
    user_id: str,
):
    """Background task: retry image generation."""
    skill = ImageGeneratorSkill()
    action = "generate_base" if image_type == "base" else "generate_content"

    async with async_session() as db:
        try:
            result = await skill.execute(
                action=action,
                params={
                    **params,
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "existing_image_id": image_id,
                },
                character_id=character_id,
                db=db,
            )
            if result.get("success"):
                logger.info(f"Retry image {image_id} generated successfully")
            else:
                logger.error(f"Retry image {image_id} generation failed: {result.get('error')}")
                # Mark as failed and refund
                res = await db.execute(select(Image).where(Image.id == image_id))
                img = res.scalar_one_or_none()
                if img:
                    img.status = DBImageStatus.FAILED
                    img.error_message = result.get("error", "Generation failed")
                from app.models.user import User as UserModel
                user_res = await db.execute(select(UserModel).where(UserModel.id == user_id))
                user = user_res.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "image_generation", db, image_id)
                await db.commit()
        except Exception as e:
            logger.error(f"Retry image {image_id} generation error: {e}")
            try:
                res = await db.execute(select(Image).where(Image.id == image_id))
                img = res.scalar_one_or_none()
                if img:
                    img.status = DBImageStatus.FAILED
                    img.error_message = str(e)
                from app.models.user import User as UserModel
                user_res = await db.execute(select(UserModel).where(UserModel.id == user_id))
                user = user_res.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "image_generation", db, image_id)
                await db.commit()
            except Exception:
                pass


@router.post("/images/{image_id}/retry", response_model=ImageResponse)
async def retry_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retry image generation (character must belong to current user or admin, costs 1 token)."""
    if current_user.is_admin:
        result = await db.execute(
            select(Image).where(Image.id == image_id)
        )
    else:
        result = await db.execute(
            select(Image)
            .join(Character)
            .where(Image.id == image_id)
            .where(Character.user_id == current_user.id)
        )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    metadata: dict[str, Any] = {}
    if image.metadata_json:
        try:
            metadata = json.loads(image.metadata_json)
        except (json.JSONDecodeError, TypeError):
            metadata = {}

    prompt = metadata.get("prompt")
    if not prompt:
        raise HTTPException(status_code=400, detail="No prompt available for retry")

    width = metadata.get("width")
    height = metadata.get("height")
    if isinstance(width, int) and isinstance(height, int):
        if width == height:
            aspect_ratio = "1:1"
        elif width > height:
            aspect_ratio = "16:9"
        else:
            aspect_ratio = "9:16"
    else:
        aspect_ratio = "9:16"

    params: dict[str, Any] = {}
    if metadata.get("style"):
        params["style"] = metadata.get("style")
    if metadata.get("cloth"):
        params["cloth"] = metadata.get("cloth")
    if metadata.get("user_reference_path"):
        params["reference_image_path"] = metadata.get("user_reference_path")
    if metadata.get("reference_image_paths"):
        params["reference_image_paths"] = metadata.get("reference_image_paths")

    # Create new image record with GENERATING status
    task_id = f"retry-{uuid.uuid4().hex[:8]}"
    new_image = Image(
        character_id=image.character_id,
        type=image.type,
        status=DBImageStatus.GENERATING,
        task_id=task_id,
        image_url="",
        is_approved=False,
        metadata_json=json.dumps({"prompt": prompt, "aspect_ratio": aspect_ratio, **params}),
    )
    db.add(new_image)
    await db.commit()
    await db.refresh(new_image)

    # Deduct token for retry
    await deduct_tokens(current_user, "image_generation", db, new_image.id)
    await db.commit()

    # Spawn background generation
    asyncio.create_task(
        _retry_image_background(
            character_id=image.character_id,
            image_id=new_image.id,
            image_type=image.type.value,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            params=params,
            user_id=current_user.id,
        )
    )

    return _image_to_response(new_image)


class DirectGenerateRequest(BaseModel):
    """Request for direct prompt generation (bypasses AI agent)."""
    character_id: str
    prompt: str
    aspect_ratio: str = "9:16"


async def _generate_direct_background(
    character_id: str,
    image_id: str,
    prompt: str,
    aspect_ratio: str,
    user_id: str,
):
    """Background task: generate a direct content image."""
    skill = ImageGeneratorSkill()
    async with async_session() as db:
        try:
            result = await skill.execute(
                action="generate_content",
                params={
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "existing_image_id": image_id,
                },
                character_id=character_id,
                db=db,
            )
            if result.get("success"):
                logger.info(f"Direct image {image_id} generated successfully")
            else:
                logger.error(f"Direct image {image_id} generation failed: {result.get('error')}")
                # Refund token on failure
                from app.models.user import User as UserModel
                user_res = await db.execute(select(UserModel).where(UserModel.id == user_id))
                user = user_res.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "image_generation", db, image_id)
                    await db.commit()
        except Exception as e:
            logger.error(f"Direct image {image_id} generation error: {e}")
            try:
                res = await db.execute(select(Image).where(Image.id == image_id))
                image = res.scalar_one_or_none()
                if image:
                    image.status = DBImageStatus.FAILED
                    image.error_message = str(e)
                # Refund token on failure
                from app.models.user import User as UserModel
                user_res = await db.execute(select(UserModel).where(UserModel.id == user_id))
                user = user_res.scalar_one_or_none()
                if user:
                    await refund_tokens(user, "image_generation", db, image_id)
                await db.commit()
            except Exception:
                pass


@router.post("/generate/direct", response_model=ImageResponse)
async def generate_direct(
    request: DirectGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate an image directly (costs 1 token, character must belong to current user or admin)."""
    # Verify character exists and belongs to user (or admin)
    if current_user.is_admin:
        char_result = await db.execute(
            select(Character).where(Character.id == request.character_id)
        )
    else:
        char_result = await db.execute(
            select(Character)
            .where(Character.id == request.character_id)
            .where(Character.user_id == current_user.id)
        )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    # Create task_id
    task_id = f"direct-{uuid.uuid4().hex[:8]}"

    # Create image record with GENERATING status
    image = Image(
        character_id=request.character_id,
        type=DBImageType.CONTENT,
        status=DBImageStatus.GENERATING,
        task_id=task_id,
        image_url="",
        is_approved=False,
        metadata_json=json.dumps({"prompt": request.prompt, "aspect_ratio": request.aspect_ratio}),
    )
    db.add(image)
    await db.commit()
    await db.refresh(image)

    # Deduct token for this image
    await deduct_tokens(current_user, "image_generation", db, image.id)
    await db.commit()

    # Spawn background generation
    asyncio.create_task(
        _generate_direct_background(
            character_id=request.character_id,
            image_id=image.id,
            prompt=request.prompt,
            aspect_ratio=request.aspect_ratio,
            user_id=current_user.id,
        )
    )

    return _image_to_response(image)
