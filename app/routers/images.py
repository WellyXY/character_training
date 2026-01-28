"""Image management router."""
import json
from typing import Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.image import Image, ImageType as DBImageType
from app.models.character import Character
from app.schemas.image import ImageResponse, ImageMetadata, ImageType, ImageStatus
from app.agent.skills.image_generator import ImageGeneratorSkill

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
):
    """List images for a character."""
    # Verify character exists
    char_result = await db.execute(
        select(Character).where(Character.id == character_id)
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
):
    """Get an image by ID."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return _image_to_response(image)


@router.post("/images/{image_id}/approve", response_model=ImageResponse)
async def approve_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Approve an image (mark as base image if type is base)."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
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
):
    """Set an image as base, replacing the oldest base image if at the limit."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
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
):
    """Delete an image."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
    )
    image = result.scalar_one_or_none()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    await db.delete(image)
    await db.commit()

    return {"status": "deleted"}


@router.post("/images/{image_id}/retry", response_model=ImageResponse)
async def retry_image(
    image_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retry image generation using stored metadata."""
    result = await db.execute(
        select(Image).where(Image.id == image_id)
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

    params: dict[str, Any] = {
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
    }

    if metadata.get("style"):
        params["style"] = metadata.get("style")
    if metadata.get("cloth"):
        params["cloth"] = metadata.get("cloth")
    if metadata.get("user_reference_path"):
        params["reference_image_path"] = metadata.get("user_reference_path")

    action = "generate_base" if image.type == DBImageType.BASE else "generate_content"
    skill = ImageGeneratorSkill()
    retry_result = await skill.execute(
        action=action,
        params=params,
        character_id=image.character_id,
        db=db,
    )

    if not retry_result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=retry_result.get("error", "Retry failed"),
        )

    new_image_id = retry_result.get("image_id")
    if not new_image_id:
        raise HTTPException(status_code=500, detail="Retry did not return image_id")

    new_result = await db.execute(
        select(Image).where(Image.id == new_image_id)
    )
    new_image = new_result.scalar_one_or_none()
    if not new_image:
        raise HTTPException(status_code=500, detail="Retry image not found")

    return _image_to_response(new_image)


class DirectGenerateRequest(BaseModel):
    """Request for direct prompt generation (bypasses AI agent)."""
    character_id: str
    prompt: str
    aspect_ratio: str = "9:16"


@router.post("/generate/direct", response_model=ImageResponse)
async def generate_direct(
    request: DirectGenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate an image directly with a custom prompt + base images, bypassing the AI agent."""
    # Verify character exists
    char_result = await db.execute(
        select(Character).where(Character.id == request.character_id)
    )
    character = char_result.scalar_one_or_none()
    if not character:
        raise HTTPException(status_code=404, detail="Character not found")

    skill = ImageGeneratorSkill()
    result = await skill.execute(
        action="generate_content",
        params={
            "prompt": request.prompt,
            "aspect_ratio": request.aspect_ratio,
        },
        character_id=request.character_id,
        db=db,
    )

    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "Generation failed"),
        )

    image_id = result.get("image_id")
    if not image_id:
        raise HTTPException(status_code=500, detail="No image_id returned")

    img_result = await db.execute(select(Image).where(Image.id == image_id))
    image = img_result.scalar_one_or_none()
    if not image:
        raise HTTPException(status_code=500, detail="Generated image not found")

    return _image_to_response(image)
