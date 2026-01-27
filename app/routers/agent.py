"""Agent chat router."""
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
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
