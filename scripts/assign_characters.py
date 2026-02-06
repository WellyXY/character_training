#!/usr/bin/env python3
"""Script to assign existing characters to a user."""
import asyncio
import sys
import os

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, update
from app.database import async_session, init_db
from app.models.user import User
from app.models.character import Character


async def assign_characters(username: str):
    """Assign all unassigned characters to a user."""
    # Initialize database tables
    await init_db()

    async with async_session() as db:
        # Find the user
        result = await db.execute(
            select(User).where(User.username == username)
        )
        user = result.scalar_one_or_none()

        if not user:
            print(f"User '{username}' not found!")
            return

        # Count unassigned characters
        result = await db.execute(
            select(Character).where(Character.user_id == None)
        )
        unassigned = result.scalars().all()

        if not unassigned:
            print("No unassigned characters found.")
            return

        print(f"Found {len(unassigned)} unassigned character(s):")
        for char in unassigned:
            print(f"  - {char.name} (ID: {char.id})")

        # Assign them to the user
        await db.execute(
            update(Character)
            .where(Character.user_id == None)
            .values(user_id=user.id)
        )
        await db.commit()

        print(f"\nAssigned {len(unassigned)} character(s) to user '{username}'")


async def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Assign characters to a user")
    parser.add_argument("--username", default="admin", help="Username to assign characters to")

    args = parser.parse_args()

    await assign_characters(args.username)


if __name__ == "__main__":
    asyncio.run(main())
