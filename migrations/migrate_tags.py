#!/usr/bin/env python3
"""
Migration script to move existing JSON tags to the new tags table structure.

This script:
1. Creates the tags and sample_post_tags tables if they don't exist
2. Parses existing JSON tags from sample_posts.tags column
3. Creates unique tags in the tags table
4. Creates associations in sample_post_tags junction table

Run with: python migrations/migrate_tags.py
"""
import asyncio
import json
import uuid
import os
import sys
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

# Get database URL from environment or use default
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/character_training")

# Convert sync URL to async if needed
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)


async def run_migration():
    """Run the tag migration."""
    print("Starting tag migration...")

    engine = create_async_engine(DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # Step 1: Create tables if they don't exist
        print("\n1. Creating tables...")

        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS tags (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))

        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS sample_post_tags (
                sample_post_id VARCHAR(36) REFERENCES sample_posts(id) ON DELETE CASCADE,
                tag_id VARCHAR(36) REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (sample_post_id, tag_id)
            )
        """))

        # Create indexes
        await session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sample_post_tags_sample_post_id
            ON sample_post_tags(sample_post_id)
        """))

        await session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_sample_post_tags_tag_id
            ON sample_post_tags(tag_id)
        """))

        await session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)
        """))

        await session.commit()
        print("Tables created successfully.")

        # Step 2: Get all sample posts with tags
        print("\n2. Fetching sample posts with tags...")

        result = await session.execute(text("""
            SELECT id, tags FROM sample_posts WHERE tags IS NOT NULL AND tags != ''
        """))
        rows = result.fetchall()
        print(f"Found {len(rows)} sample posts with tags.")

        if not rows:
            print("No tags to migrate.")
            return

        # Step 3: Parse all unique tags
        print("\n3. Parsing unique tags...")

        all_tags = set()
        sample_tags_map = {}  # sample_id -> list of tag names

        for row in rows:
            sample_id = row[0]
            tags_json = row[1]

            try:
                tags = json.loads(tags_json)
                if isinstance(tags, list):
                    normalized_tags = [t.strip().lower() for t in tags if t.strip()]
                    all_tags.update(normalized_tags)
                    sample_tags_map[sample_id] = normalized_tags
            except json.JSONDecodeError:
                print(f"Warning: Could not parse tags for sample {sample_id}: {tags_json}")
                continue

        print(f"Found {len(all_tags)} unique tags.")

        # Step 4: Insert unique tags
        print("\n4. Inserting unique tags...")

        tag_name_to_id = {}

        for tag_name in all_tags:
            # Check if tag already exists
            result = await session.execute(
                text("SELECT id FROM tags WHERE name = :name"),
                {"name": tag_name}
            )
            existing = result.fetchone()

            if existing:
                tag_name_to_id[tag_name] = existing[0]
            else:
                tag_id = str(uuid.uuid4())
                await session.execute(
                    text("INSERT INTO tags (id, name, created_at) VALUES (:id, :name, :created_at)"),
                    {"id": tag_id, "name": tag_name, "created_at": datetime.utcnow()}
                )
                tag_name_to_id[tag_name] = tag_id

        await session.commit()
        print(f"Inserted/found {len(tag_name_to_id)} tags.")

        # Step 5: Create associations
        print("\n5. Creating sample-tag associations...")

        association_count = 0
        for sample_id, tags in sample_tags_map.items():
            for tag_name in tags:
                tag_id = tag_name_to_id.get(tag_name)
                if tag_id:
                    # Check if association already exists
                    result = await session.execute(
                        text("""
                            SELECT 1 FROM sample_post_tags
                            WHERE sample_post_id = :sample_id AND tag_id = :tag_id
                        """),
                        {"sample_id": sample_id, "tag_id": tag_id}
                    )
                    if not result.fetchone():
                        await session.execute(
                            text("""
                                INSERT INTO sample_post_tags (sample_post_id, tag_id)
                                VALUES (:sample_id, :tag_id)
                            """),
                            {"sample_id": sample_id, "tag_id": tag_id}
                        )
                        association_count += 1

        await session.commit()
        print(f"Created {association_count} new associations.")

        print("\nMigration completed successfully!")
        print(f"Summary:")
        print(f"  - Sample posts processed: {len(sample_tags_map)}")
        print(f"  - Unique tags: {len(tag_name_to_id)}")
        print(f"  - Associations created: {association_count}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run_migration())
