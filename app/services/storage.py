"""File storage service."""
import uuid
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.file_blob import FileBlob


class StorageService:
    """Service for handling file uploads and storage."""

    def __init__(self):
        settings = get_settings()
        # Strip whitespace and trailing slash from URL
        self.public_base_url = settings.public_base_url.strip().rstrip("/")

    def _generate_filename(self, original_name: str) -> str:
        """Generate a unique filename."""
        ext = Path(original_name).suffix.lower()
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        return f"{timestamp}_{unique_id}{ext}"

    async def save_upload(self, file: UploadFile, db: AsyncSession) -> dict:
        """
        Save an uploaded file to the database.

        Returns:
            Dictionary with file info including URL
        """
        content = await file.read()
        filename = self._generate_filename(file.filename or "file")
        content_type = file.content_type or "application/octet-stream"
        size = len(content)
        blob = FileBlob(
            filename=filename,
            content_type=content_type,
            size=size,
            data=content,
        )
        db.add(blob)
        await db.flush()
        return {
            "id": blob.id,
            "filename": filename,
            "original_name": file.filename,
            "content_type": content_type,
            "size": size,
            "url": f"/uploads/{blob.id}",
            "full_url": f"{self.public_base_url}/uploads/{blob.id}",
            "created_at": datetime.utcnow().isoformat(),
        }

    async def save_from_url(self, url: str, db: AsyncSession, prefix: str = "downloaded") -> dict:
        """
        Download and save a file (image or video) to the database.

        Returns:
            Dictionary with file info including local URL
        """
        import httpx

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()

            # Determine extension from content type
            content_type = response.headers.get("content-type", "application/octet-stream")
            ext_map = {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
                "image/gif": ".gif",
                "video/mp4": ".mp4",
                "video/webm": ".webm",
                "video/quicktime": ".mov",
            }
            ext = ext_map.get(content_type.split(";")[0], ".bin")

            filename = self._generate_filename(f"{prefix}{ext}")
            size = len(response.content)
            blob = FileBlob(
                filename=filename,
                content_type=content_type,
                size=size,
                data=response.content,
            )
            db.add(blob)
            await db.flush()
            return {
                "id": blob.id,
                "filename": filename,
                "content_type": content_type,
                "size": size,
                "url": f"/uploads/{blob.id}",
                "full_url": f"{self.public_base_url}/uploads/{blob.id}",
                "created_at": datetime.utcnow().isoformat(),
            }

    async def save_bytes(
        self,
        content: bytes,
        filename: str,
        content_type: str,
        db: AsyncSession,
    ) -> dict:
        """
        Save raw bytes to the database.

        Returns:
            Dictionary with file info including URL
        """
        generated_filename = self._generate_filename(filename)
        size = len(content)
        blob = FileBlob(
            filename=generated_filename,
            content_type=content_type,
            size=size,
            data=content,
        )
        db.add(blob)
        await db.flush()
        return {
            "id": blob.id,
            "filename": generated_filename,
            "original_name": filename,
            "content_type": content_type,
            "size": size,
            "url": f"/uploads/{blob.id}",
            "full_url": f"{self.public_base_url}/uploads/{blob.id}",
            "created_at": datetime.utcnow().isoformat(),
        }

    async def get_file_blob(self, file_id: str, db: AsyncSession) -> Optional[FileBlob]:
        """Fetch a file blob by ID."""
        result = await db.execute(
            select(FileBlob).where(FileBlob.id == file_id)
        )
        return result.scalar_one_or_none()

    async def delete_file(self, file_id: str, db: AsyncSession) -> bool:
        """Delete a file from storage."""
        blob = await self.get_file_blob(file_id, db)
        if not blob:
            return False
        await db.delete(blob)
        await db.flush()
        return True

    def get_full_url(self, relative_url: str) -> str:
        """Get full URL from relative path."""
        if relative_url.startswith("http"):
            return relative_url
        return f"{self.public_base_url}{relative_url}"


# Singleton
_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Get storage service instance."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
