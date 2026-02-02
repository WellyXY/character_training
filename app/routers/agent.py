"""Agent chat router."""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.agent import (
    AgentChatRequest,
    AgentChatResponse,
    AgentConfirmRequest,
    ConversationState,
    ImageEditRequest,
    ImageEditConfirmRequest,
    GenerationTask,
    GenerationTaskStatus,
)
from app.agent.core import Agent, get_agent
from app.agent.skills.edit_prompt_optimizer import EditPromptOptimizerSkill
from app.clients.seedream import get_seedream_client
from app.services.storage import get_storage_service
from app.models.image import Image, ImageType, ImageStatus

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/agent/chat", response_model=AgentChatResponse)
async def agent_chat(
    request: AgentChatRequest,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_agent),
):
    """
    Send a message to the agent.

    The agent will analyze the message and either:
    - Execute immediately (for non-generation tasks)
    - Return a confirmation card (for generation tasks)
    """
    logger.info(f"=== /agent/chat request ===")
    logger.info(f"Message: {request.message}")
    logger.info(f"Character ID: {request.character_id}")
    logger.info(f"Session ID: {request.session_id}")
    # Only show filename for reference image to avoid long base64/URL logs
    ref_display = None
    if request.reference_image_path:
        if request.reference_image_path.startswith("data:"):
            ref_display = "[base64 image data]"
        elif "/" in request.reference_image_path:
            ref_display = request.reference_image_path.split("/")[-1]
        else:
            ref_display = request.reference_image_path[:50] + "..." if len(request.reference_image_path) > 50 else request.reference_image_path
    logger.info(f"Reference image: {ref_display}")
    logger.info(f"Reference image mode: {request.reference_image_mode}")
    try:
        response = await agent.process_message(
            message=request.message,
            character_id=request.character_id,
            session_id=request.session_id,
            reference_image_path=request.reference_image_path,
            reference_image_mode=request.reference_image_mode.value if request.reference_image_mode else None,
            db=db,
        )
        # Log response without full reference image path
        logger.info(f"Response state: {response.state}, session: {response.session_id}, has_pending: {response.pending_generation is not None}")
        return response
    except Exception as e:
        logger.exception(f"Error in agent_chat: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent/confirm", response_model=AgentChatResponse)
async def agent_confirm(
    request: AgentConfirmRequest,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_agent),
):
    """
    Confirm a pending generation.

    Called after user approves the confirmation card.
    """
    try:
        response = await agent.confirm_generation(
            session_id=request.session_id,
            aspect_ratio=request.aspect_ratio,
            modifications=request.modifications,
            edited_prompt=request.edited_prompt,
            character_id=request.character_id,
            pending_generation=request.pending_generation,
            db=db,
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent/cancel")
async def agent_cancel(
    session_id: str,
    agent: Agent = Depends(get_agent),
):
    """Cancel a pending generation."""
    agent.cancel_pending(session_id)
    return {"status": "cancelled"}


@router.post("/agent/clear")
async def agent_clear(
    session_id: str,
    agent: Agent = Depends(get_agent),
):
    """Clear conversation history for a session."""
    agent.clear_session(session_id)
    return {"status": "cleared"}


@router.post("/agent/image-edit", response_model=AgentChatResponse)
async def image_edit_chat(
    request: ImageEditRequest,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_agent),
):
    """
    Send an image edit request to the agent.

    The agent will analyze the edit instruction and source image,
    then return an optimized prompt for confirmation.
    """
    try:
        response = await agent.process_edit_message(
            message=request.message,
            source_image_path=request.source_image_path,
            character_id=request.character_id,
            session_id=request.session_id,
            db=db,
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent/image-edit/confirm", response_model=AgentChatResponse)
async def image_edit_confirm(
    request: ImageEditConfirmRequest,
    db: AsyncSession = Depends(get_db),
    agent: Agent = Depends(get_agent),
):
    """
    Confirm a pending image edit.

    Called after user approves the edit confirmation card.
    """
    try:
        response = await agent.confirm_edit(
            session_id=request.session_id,
            aspect_ratio=request.aspect_ratio,
            edited_prompt=request.edited_prompt,
            character_id=request.character_id,
            pending_edit=request.pending_edit,
            db=db,
        )
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agent/tasks/{task_id}", response_model=GenerationTask)
async def get_task_status(
    task_id: str,
    session_id: str = Query(..., description="Session ID"),
    agent: Agent = Depends(get_agent),
):
    """
    Get the status of a background generation task.

    Used for polling task progress from the frontend.
    """
    task = agent.get_task(session_id, task_id)
    if not task:
        # Return a "not found" task instead of 404 to avoid log spam after server restart
        from datetime import datetime
        return GenerationTask(
            task_id=task_id,
            status=GenerationTaskStatus.FAILED,
            progress=0,
            stage="not_found",
            prompt="",
            error="Task not found (server may have restarted)",
            created_at=datetime.utcnow().isoformat(),
        )
    return task


# --- Direct Image Edit (Simplified Flow) ---

class DirectEditRequest(BaseModel):
    """Request for direct image edit without agent analysis."""
    prompt: str
    source_image_path: str
    character_id: str
    aspect_ratio: str = "9:16"
    ai_optimize: bool = False  # If True, use Gemini to optimize prompt before generation


class DirectEditResponse(BaseModel):
    """Response from direct image edit."""
    success: bool
    image_id: Optional[str] = None
    image_url: Optional[str] = None
    message: str
    # Metadata for saving later (when not auto-saved)
    metadata: Optional[dict] = None


class SaveEditRequest(BaseModel):
    """Request to save a generated edit to the gallery."""
    image_url: str
    character_id: str
    metadata: dict


def _parse_aspect_ratio(aspect_ratio: str) -> tuple[int, int]:
    """Parse aspect ratio string to width, height."""
    ratios = {
        "9:16": (1024, 1820),
        "1:1": (1024, 1024),
        "16:9": (1820, 1024),
    }
    return ratios.get(aspect_ratio, (1024, 1820))


@router.post("/agent/image-edit/direct", response_model=DirectEditResponse)
async def direct_image_edit(
    request: DirectEditRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Direct image edit: use prompt + source image to generate a new image.

    This is a simplified flow that bypasses the agent GPT analysis.
    The source image is used as a reference for the generation.

    If ai_optimize=True, the prompt will be optimized by Gemini before generation.
    """
    logger.info(f"=== /agent/image-edit/direct request ===")
    logger.info(f"Prompt: {request.prompt}")
    logger.info(f"Character ID: {request.character_id}")
    logger.info(f"Aspect ratio: {request.aspect_ratio}")
    logger.info(f"AI optimize: {request.ai_optimize}")
    # Only show filename for source image
    source_display = request.source_image_path.split("/")[-1] if "/" in request.source_image_path else request.source_image_path[:50]
    logger.info(f"Source image: {source_display}")

    try:
        seedream = get_seedream_client()
        storage = get_storage_service()

        width, height = _parse_aspect_ratio(request.aspect_ratio)

        # Optimize prompt with Gemini if ai_optimize is enabled
        final_prompt = request.prompt
        if request.ai_optimize:
            logger.info("AI optimize enabled, optimizing prompt with Gemini...")
            optimizer = EditPromptOptimizerSkill()
            optimized_prompt, detected_type, analysis = await optimizer.optimize(
                edit_instruction=request.prompt,
                source_image_path=request.source_image_path,
                db=db,
            )
            final_prompt = optimized_prompt
            logger.info(f"Optimized prompt: {final_prompt[:200]}...")

        # Use the source image as reference for generation
        source_full_url = storage.get_full_url(request.source_image_path)
        reference_images = [source_full_url]

        logger.info(f"Generating with reference image: {source_display}")

        # Generate image with Seedream
        result = await seedream.generate(
            prompt=final_prompt,
            width=width,
            height=height,
            reference_images=reference_images,
        )

        image_url = result.get("image_url")
        if not image_url:
            return DirectEditResponse(
                success=False,
                message="No image URL in generation response",
            )

        # Download and save the image locally (but don't create DB record yet)
        saved = await storage.save_from_url(image_url, db, prefix="edit")
        # Commit so the image is available for frontend to display
        await db.commit()

        # Build metadata for later saving
        metadata = {
            "prompt": final_prompt,
            "original_prompt": request.prompt,
            "ai_optimized": request.ai_optimize,
            "width": width,
            "height": height,
            "seed": result.get("seed"),
            "source_image_path": request.source_image_path,
            "edit_type": "direct",
            "character_id": request.character_id,
            "local_url": saved["url"],  # Store the local path for saving
        }

        logger.info(f"Direct edit successful, image ready for save: {saved['url']}")

        # Return image without saving to gallery - user must click Save
        return DirectEditResponse(
            success=True,
            image_id=None,  # No ID yet - not saved to gallery
            image_url=saved["full_url"],
            message="Image generated. Click Save to add to gallery.",
            metadata=metadata,
        )

    except Exception as e:
        logger.exception(f"Error in direct_image_edit: {e}")
        return DirectEditResponse(
            success=False,
            message=f"Generation failed: {str(e)}",
        )


@router.post("/agent/image-edit/save", response_model=DirectEditResponse)
async def save_edited_image(
    request: SaveEditRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Save a generated edit image to the gallery.

    This is called when user clicks "Save" on a generated image.
    """
    logger.info(f"=== /agent/image-edit/save request ===")
    logger.info(f"Character ID: {request.character_id}")
    logger.info(f"Image URL: {request.image_url}")

    try:
        # Get the local URL from metadata
        local_url = request.metadata.get("local_url")
        if not local_url:
            return DirectEditResponse(
                success=False,
                message="Missing local_url in metadata",
            )

        # Create new image record in database
        image = Image(
            character_id=request.character_id,
            type=ImageType.CONTENT,
            image_url=local_url,
            status=ImageStatus.COMPLETED,
            is_approved=False,
            metadata_json=json.dumps(request.metadata),
        )
        db.add(image)
        await db.commit()
        await db.refresh(image)

        logger.info(f"Image saved to gallery: image_id={image.id}")

        return DirectEditResponse(
            success=True,
            image_id=image.id,
            image_url=request.image_url,
            message="Image saved to gallery",
        )

    except Exception as e:
        logger.exception(f"Error in save_edited_image: {e}")
        return DirectEditResponse(
            success=False,
            message=f"Save failed: {str(e)}",
        )
