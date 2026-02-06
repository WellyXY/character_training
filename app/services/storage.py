"""File storage service with support for Database and Google Cloud Storage."""
import uuid
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

logger = logging.getLogger(__name__)


class StorageService:
    """Service for handling file uploads and storage."""

    def __init__(self):
        settings = get_settings()
        self.public_base_url = settings.public_base_url.strip().rstrip("/")
        self.storage_backend = settings.storage_backend.lower()
        self.gcs_bucket_name = settings.gcs_bucket_name
        self.gcs_project_id = settings.gcs_project_id
        self._gcs_client = None
        self._gcs_bucket = None

    def _get_gcs_bucket(self):
        """Get GCS bucket (lazy initialization)."""
        if self._gcs_bucket is None:
            from google.cloud import storage as gcs_storage
            self._gcs_client = gcs_storage.Client(project=self.gcs_project_id or None)
            self._gcs_bucket = self._gcs_client.bucket(self.gcs_bucket_name)
        return self._gcs_bucket

    def _generate_filename(self, original_name: str) -> str:
        """Generate a unique filename."""
        ext = Path(original_name).suffix.lower()
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        return f"{timestamp}_{unique_id}{ext}"

    def _generate_gcs_path(self, filename: str) -> str:
        """Generate GCS object path with date-based folder structure."""
        date_folder = datetime.utcnow().strftime("%Y/%m/%d")
        return f"uploads/{date_folder}/{filename}"

    async def _save_to_gcs(self, content: bytes, filename: str, content_type: str) -> dict:
        """Save file to Google Cloud Storage."""
        bucket = self._get_gcs_bucket()
        gcs_path = self._generate_gcs_path(filename)
        blob = bucket.blob(gcs_path)
        blob.upload_from_string(content, content_type=content_type)

        # Make the blob publicly readable
        blob.make_public()

        return {
            "id": gcs_path,
            "filename": filename,
            "content_type": content_type,
            "size": len(content),
            "url": blob.public_url,
            "full_url": blob.public_url,
            "gcs_path": gcs_path,
            "created_at": datetime.utcnow().isoformat(),
        }

    async def _save_to_database(self, content: bytes, filename: str, content_type: str, db: AsyncSession) -> dict:
        """Save file to database."""
        from app.models.file_blob import FileBlob

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
            "content_type": content_type,
            "size": size,
            "url": f"/uploads/{blob.id}",
            "full_url": f"{self.public_base_url}/uploads/{blob.id}",
            "created_at": datetime.utcnow().isoformat(),
        }

    async def save_upload(self, file: UploadFile, db: AsyncSession) -> dict:
        """
        Save an uploaded file.

        Returns:
            Dictionary with file info including URL
        """
        content = await file.read()
        filename = self._generate_filename(file.filename or "file")
        content_type = file.content_type or "application/octet-stream"

        if self.storage_backend == "gcs":
            result = await self._save_to_gcs(content, filename, content_type)
            result["original_name"] = file.filename
            return result
        else:
            result = await self._save_to_database(content, filename, content_type, db)
            result["original_name"] = file.filename
            return result

    async def save_from_url(self, url: str, db: AsyncSession, prefix: str = "downloaded") -> dict:
        """
        Download and save a file (image or video).

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

            if self.storage_backend == "gcs":
                return await self._save_to_gcs(response.content, filename, content_type)
            else:
                return await self._save_to_database(response.content, filename, content_type, db)

    async def save_bytes(
        self,
        content: bytes,
        filename: str,
        content_type: str,
        db: AsyncSession,
    ) -> dict:
        """
        Save raw bytes.

        Returns:
            Dictionary with file info including URL
        """
        generated_filename = self._generate_filename(filename)

        if self.storage_backend == "gcs":
            result = await self._save_to_gcs(content, generated_filename, content_type)
            result["original_name"] = filename
            return result
        else:
            result = await self._save_to_database(content, generated_filename, content_type, db)
            result["original_name"] = filename
            return result

    async def get_file_blob(self, file_id: str, db: AsyncSession):
        """Fetch a file blob by ID (database storage only)."""
        from app.models.file_blob import FileBlob

        result = await db.execute(
            select(FileBlob).where(FileBlob.id == file_id)
        )
        return result.scalar_one_or_none()

    async def get_file_from_gcs(self, gcs_path: str) -> Optional[tuple[bytes, str]]:
        """Fetch file content from GCS. Returns (content, content_type) or None."""
        try:
            bucket = self._get_gcs_bucket()
            blob = bucket.blob(gcs_path)
            if not blob.exists():
                return None
            content = blob.download_as_bytes()
            return (content, blob.content_type or "application/octet-stream")
        except Exception as e:
            logger.error(f"Failed to fetch from GCS: {e}")
            return None

    async def delete_file(self, file_id: str, db: AsyncSession) -> bool:
        """Delete a file from storage."""
        if self.storage_backend == "gcs":
            try:
                bucket = self._get_gcs_bucket()
                blob = bucket.blob(file_id)
                blob.delete()
                return True
            except Exception as e:
                logger.error(f"Failed to delete from GCS: {e}")
                return False
        else:
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

    def is_gcs_url(self, url: str) -> bool:
        """Check if URL is a GCS URL."""
        return "storage.googleapis.com" in url or "storage.cloud.google.com" in url


# Singleton
_storage_service: Optional[StorageService] = None


def get_storage_service() -> StorageService:
    """Get storage service instance."""
    global _storage_service
    if _storage_service is None:
        _storage_service = StorageService()
    return _storage_service
