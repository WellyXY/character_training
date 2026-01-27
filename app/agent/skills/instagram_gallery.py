"""Instagram reference gallery skill."""
import re
import logging
from typing import Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

import instaloader

from app.agent.skills.base import BaseSkill
from app.services.storage import get_storage_service

logger = logging.getLogger(__name__)


class InstagramGallerySkill(BaseSkill):
    """Skill for fetching images from Instagram posts as references."""

    name = "instagram_gallery"
    description = "Fetch images from Instagram posts for reference"

    def __init__(self):
        self.storage = get_storage_service()
        # Create instaloader instance with minimal settings
        self.loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            download_geotags=False,
            download_comments=False,
            save_metadata=False,
            compress_json=False,
            quiet=True,
        )

    async def execute(
        self,
        action: str,
        params: dict[str, Any],
        character_id: Optional[str],
        db: AsyncSession,
    ) -> dict[str, Any]:
        if action == "fetch":
            return await self._fetch_images(params, db)
        return {"success": False, "error": f"Unknown action: {action}"}

    def get_actions(self) -> list[str]:
        return ["fetch"]

    def _extract_shortcode(self, url: str) -> Optional[str]:
        """Extract Instagram post shortcode from URL."""
        # Patterns:
        # https://www.instagram.com/p/ABC123/
        # https://www.instagram.com/reel/ABC123/
        # https://instagram.com/p/ABC123
        patterns = [
            r"instagram\.com/p/([A-Za-z0-9_-]+)",
            r"instagram\.com/reel/([A-Za-z0-9_-]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None

    async def _fetch_images(self, params: dict[str, Any], db: AsyncSession) -> dict[str, Any]:
        """Fetch images from an Instagram post using instaloader."""
        url = params.get("url", "")
        shortcode = self._extract_shortcode(url)

        if not shortcode:
            return {
                "success": False,
                "error": "無法解析 Instagram URL。請提供有效的貼文連結。",
            }

        try:
            # Get post by shortcode
            post = instaloader.Post.from_shortcode(self.loader.context, shortcode)

            # Extract image URLs
            image_urls = []
            if post.typename == "GraphSidecar":
                # Carousel post - multiple images
                for node in post.get_sidecar_nodes():
                    if not node.is_video:
                        image_urls.append(node.display_url)
            elif not post.is_video:
                # Single image
                image_urls.append(post.url)

            if not image_urls:
                return {"success": False, "error": "貼文中沒有圖片（可能是純影片貼文）"}

            # Limit to 5 images
            image_urls = image_urls[:5]

            # Download and save images
            saved_images = []
            for i, img_url in enumerate(image_urls):
                try:
                    saved = await self.storage.save_from_url(
                        img_url, db, prefix="instagram_ref"
                    )
                    saved_images.append({
                        "index": i,
                        "path": saved["url"],
                        "full_url": saved["full_url"],
                    })
                except Exception as e:
                    logger.warning(f"Failed to download image {i}: {e}")

            if not saved_images:
                return {"success": False, "error": "無法下載任何圖片"}

            await db.commit()

            return {
                "success": True,
                "images": saved_images,
                "count": len(saved_images),
                "owner": post.owner_username,
                "caption": post.caption[:200] if post.caption else None,
                "message": f"成功下載 {len(saved_images)} 張圖片作為參考",
            }

        except instaloader.exceptions.LoginRequiredException:
            return {"success": False, "error": "此貼文需要登入才能查看（可能是私人帳號）"}
        except instaloader.exceptions.ProfileNotExistsException:
            return {"success": False, "error": "貼文不存在或已被刪除"}
        except instaloader.exceptions.QueryReturnedBadRequestException:
            return {"success": False, "error": "Instagram API 請求失敗，請稍後再試"}
        except Exception as e:
            logger.error(f"Instagram fetch error: {e}")
            return {"success": False, "error": f"下載失敗: {str(e)}"}
