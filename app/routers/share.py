"""Email sharing endpoint via Brevo HTTP API."""
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import get_settings
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
    settings = get_settings()

    if not settings.brevo_api_key:
        raise HTTPException(status_code=503, detail="Email sharing is not configured")

    is_video = data.content_type == "video"
    subject = "Check out this video from Parrot Studio" if is_video else "Check out this image from Parrot Studio"

    media_block = (
        f'<video src="{data.content_url}" controls style="width:100%;border-radius:12px;max-height:600px;"></video>'
        if is_video
        else f'<img src="{data.content_url}" style="width:100%;border-radius:12px;" />'
    )
    personal_note = (
        f'<p style="color:#ccc;font-size:14px;margin-bottom:24px;">{data.message}</p>'
        if data.message else ""
    )

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#111;border-radius:16px;overflow:hidden;border:1px solid #222;">
    <div style="padding:24px 24px 0;text-align:center;">
      <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Parrot Studio</p>
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">{'A video' if is_video else 'An image'} was shared with you</h2>
      {personal_note}
    </div>
    <div style="padding:0 16px;">{media_block}</div>
    <div style="padding:20px 24px;text-align:center;">
      <a href="{data.content_url}" style="display:inline-block;background:#fff;color:#000;text-decoration:none;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">
        View Full Size
      </a>
    </div>
    <div style="padding:16px 24px;text-align:center;border-top:1px solid #222;">
      <p style="color:#555;font-size:11px;margin:0;">Shared via Parrot Studio · AI Character Platform</p>
    </div>
  </div>
</body>
</html>"""

    sender_email = settings.smtp_from or "noreply@parrotstudio.app"
    # Strip display name if present, e.g. "Parrot Studio <email@x.com>" -> "email@x.com"
    if "<" in sender_email and ">" in sender_email:
        sender_name = sender_email.split("<")[0].strip()
        sender_email_addr = sender_email.split("<")[1].rstrip(">").strip()
    else:
        sender_name = "Parrot Studio"
        sender_email_addr = sender_email

    payload = {
        "sender": {"name": sender_name, "email": sender_email_addr},
        "to": [{"email": str(data.recipient_email)}],
        "subject": subject,
        "htmlContent": html,
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                json=payload,
                headers={"api-key": settings.brevo_api_key, "Content-Type": "application/json"},
            )
        if resp.status_code not in (200, 201):
            logger.error(f"Brevo API error {resp.status_code}: {resp.text}")
            raise HTTPException(status_code=502, detail=f"Email provider error: {resp.text}")
        logger.info(f"Share email sent to {data.recipient_email} by user {current_user.id}")
        return {"success": True}
    except httpx.HTTPError as e:
        logger.error(f"Failed to send share email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")
