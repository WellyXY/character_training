#!/usr/bin/env python3
"""
Import Instagram posts as samples into the Sample Gallery.

Usage:
    python scripts/import_samples.py urls.txt [--tags tag1,tag2]
    python scripts/import_samples.py urls.json

Input formats:
    - .txt file: One Instagram URL per line
    - .json file: Array of objects with "url" and optional "tags" fields
      [{"url": "https://instagram.com/p/xxx", "tags": ["style1"]}]
"""
import argparse
import asyncio
import json
import logging
import re
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import instaloader
import httpx

from app.config import get_settings
from app.database import async_session
from app.models.sample_post import SamplePost, MediaType

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()
UPLOAD_DIR = Path(settings.upload_dir) / "samples"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def extract_shortcode(url: str) -> Optional[str]:
    """Extract Instagram post shortcode from URL."""
    patterns = [
        r"instagram\.com/p/([A-Za-z0-9_-]+)",
        r"instagram\.com/reel/([A-Za-z0-9_-]+)",
        r"instagram\.com/[^/]+/p/([A-Za-z0-9_-]+)",      # with username: /username/p/xxx
        r"instagram\.com/[^/]+/reel/([A-Za-z0-9_-]+)",   # with username: /username/reel/xxx
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def generate_filename(prefix: str, ext: str) -> str:
    """Generate a unique filename."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    unique_id = str(uuid.uuid4())[:8]
    return f"{prefix}_{timestamp}_{unique_id}{ext}"


async def download_file(url: str, prefix: str) -> Optional[dict]:
    """Download a file from URL and save to samples directory."""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(url)
            response.raise_for_status()

            content_type = response.headers.get("content-type", "application/octet-stream")
            ext_map = {
                "image/jpeg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
                "image/gif": ".gif",
                "video/mp4": ".mp4",
            }
            ext = ext_map.get(content_type.split(";")[0], ".jpg")

            filename = generate_filename(prefix, ext)
            file_path = UPLOAD_DIR / filename

            with open(file_path, "wb") as f:
                f.write(response.content)

            return {
                "filename": filename,
                "path": f"/uploads/samples/{filename}",
                "content_type": content_type,
                "is_video": "video" in content_type,
            }
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        return None


def generate_video_thumbnail(video_path: Path, output_path: Path) -> bool:
    """Generate thumbnail from video first frame using ffmpeg."""
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_path),
            "-vframes", "1",
            "-q:v", "2",
            str(output_path)
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path.exists()
    except Exception as e:
        logger.warning(f"Failed to generate thumbnail: {e}")
        return False


async def process_instagram_url(
    loader: instaloader.Instaloader,
    url: str,
    tags: list[str] = None,
) -> Optional[dict]:
    """Process an Instagram URL and extract media info."""
    shortcode = extract_shortcode(url)
    if not shortcode:
        logger.warning(f"Cannot extract shortcode from: {url}")
        return None

    try:
        post = instaloader.Post.from_shortcode(loader.context, shortcode)

        # Determine media type and URL
        is_video = post.is_video
        media_url = post.video_url if is_video else post.url

        # Download media
        prefix = f"sample_{post.owner_username}"
        downloaded = await download_file(media_url, prefix)
        if not downloaded:
            return None

        # Handle thumbnail
        if is_video:
            # For video, try to extract first frame as thumbnail
            video_file = UPLOAD_DIR / downloaded["filename"]
            thumb_filename = generate_filename(f"thumb_{post.owner_username}", ".jpg")
            thumb_path = UPLOAD_DIR / thumb_filename

            if generate_video_thumbnail(video_file, thumb_path):
                thumbnail_url = f"/uploads/samples/{thumb_filename}"
            else:
                # Fallback: use video URL as thumbnail (Instagram provides video poster)
                thumbnail_url = downloaded["path"]
        else:
            # For images, use same as media
            thumbnail_url = downloaded["path"]

        return {
            "creator_name": post.owner_username,
            "source_url": url,
            "media_type": MediaType.VIDEO if is_video else MediaType.IMAGE,
            "media_url": downloaded["path"],
            "thumbnail_url": thumbnail_url,
            "caption": post.caption[:1000] if post.caption else None,
            "tags": tags or [],
            "metadata": {
                "likes": post.likes,
                "shortcode": shortcode,
                "post_date": post.date_utc.isoformat() if post.date_utc else None,
            },
        }

    except instaloader.exceptions.LoginRequiredException:
        logger.warning(f"Login required for: {url}")
        return None
    except instaloader.exceptions.ProfileNotExistsException:
        logger.warning(f"Post not found: {url}")
        return None
    except Exception as e:
        logger.error(f"Error processing {url}: {e}")
        return None


async def import_samples(input_file: str, default_tags: list[str] = None):
    """Import samples from input file."""
    input_path = Path(input_file)

    if not input_path.exists():
        logger.error(f"Input file not found: {input_file}")
        return

    # Parse input file
    urls_with_tags = []

    if input_path.suffix == ".json":
        with open(input_path) as f:
            data = json.load(f)
            for item in data:
                if isinstance(item, str):
                    urls_with_tags.append({"url": item, "tags": default_tags or []})
                else:
                    urls_with_tags.append({
                        "url": item.get("url", ""),
                        "tags": item.get("tags", default_tags or []),
                    })
    else:
        # Assume text file with one URL per line
        with open(input_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    urls_with_tags.append({"url": line, "tags": default_tags or []})

    if not urls_with_tags:
        logger.error("No URLs found in input file")
        return

    logger.info(f"Found {len(urls_with_tags)} URLs to process")

    # Initialize instaloader
    loader = instaloader.Instaloader(
        download_pictures=False,
        download_videos=False,
        download_video_thumbnails=False,
        download_geotags=False,
        download_comments=False,
        save_metadata=False,
        compress_json=False,
        quiet=True,
    )

    # Process URLs
    success_count = 0
    async with async_session() as db:
        for i, item in enumerate(urls_with_tags, 1):
            url = item["url"]
            tags = item["tags"]

            logger.info(f"[{i}/{len(urls_with_tags)}] Processing: {url}")

            result = await process_instagram_url(loader, url, tags)
            if result:
                # Check if already exists
                from sqlalchemy import select
                existing = await db.execute(
                    select(SamplePost).where(SamplePost.source_url == url)
                )
                if existing.scalar_one_or_none():
                    logger.info(f"  Skipping (already exists): {url}")
                    continue

                # Create sample post
                sample = SamplePost(
                    creator_name=result["creator_name"],
                    source_url=result["source_url"],
                    media_type=result["media_type"],
                    media_url=result["media_url"],
                    thumbnail_url=result["thumbnail_url"],
                    caption=result["caption"],
                    tags=json.dumps(result["tags"]) if result["tags"] else None,
                    metadata_json=json.dumps(result["metadata"]) if result["metadata"] else None,
                )
                db.add(sample)
                await db.commit()

                success_count += 1
                logger.info(f"  Imported: {result['creator_name']} ({result['media_type'].value})")
            else:
                logger.warning(f"  Failed to process: {url}")

            # Rate limiting - be gentle with Instagram
            await asyncio.sleep(2)

    logger.info(f"\nImport complete: {success_count}/{len(urls_with_tags)} samples imported")


def main():
    parser = argparse.ArgumentParser(
        description="Import Instagram posts as samples into the Sample Gallery"
    )
    parser.add_argument(
        "input_file",
        help="Input file (txt with URLs or JSON)"
    )
    parser.add_argument(
        "--tags",
        help="Default tags to apply (comma-separated)",
        default=""
    )

    args = parser.parse_args()

    default_tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    asyncio.run(import_samples(args.input_file, default_tags))


if __name__ == "__main__":
    main()
