"""Email sharing endpoint — generates a mailto link for client-side sharing."""
import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


class ShareEmailRequest(BaseModel):
    recipient_email: EmailStr
    content_url: str
    content_type: str = "image"
    message: str = ""


@router.post("/share/email")
async def share_by_email(
    data: ShareEmailRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return a mailto link for client-side email sharing."""
    is_video = data.content_type == "video"
    subject = "Check out this video from Parrot Studio" if is_video else "Check out this image from Parrot Studio"
    body_parts = []
    if data.message:
        body_parts.append(data.message)
    body_parts.append(data.content_url)
    body = "\n\n".join(body_parts)

    import urllib.parse
    mailto = (
        f"mailto:{urllib.parse.quote(str(data.recipient_email))}"
        f"?subject={urllib.parse.quote(subject)}"
        f"&body={urllib.parse.quote(body)}"
    )
    logger.info(f"Share mailto generated for {data.recipient_email} by user {current_user.id}")
    return {"success": True, "mailto": mailto}
