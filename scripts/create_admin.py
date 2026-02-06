#!/usr/bin/env python3
"""Script to create the initial admin user."""
import asyncio
import sys
import os

# Add the parent directory to the path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from app.database import async_session, init_db
from app.models.user import User
from app.auth import get_password_hash


async def create_admin(
    email: str = "admin@example.com",
    username: str = "admin",
    password: str = "admin123",
    token_balance: int = 1000,
):
    """Create an admin user if one doesn't exist."""
    # Initialize database tables
    await init_db()

    async with async_session() as db:
        # Check if admin already exists
        result = await db.execute(
            select(User).where(User.username == username)
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"User '{username}' already exists!")
            print(f"  ID: {existing.id}")
            print(f"  Email: {existing.email}")
            print(f"  Is Admin: {existing.is_admin}")
            print(f"  Token Balance: {existing.token_balance}")
            return existing

        # Create admin user
        admin = User(
            email=email,
            username=username,
            hashed_password=get_password_hash(password),
            token_balance=token_balance,
            is_admin=True,
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

        print(f"Admin user created successfully!")
        print(f"  ID: {admin.id}")
        print(f"  Username: {admin.username}")
        print(f"  Email: {admin.email}")
        print(f"  Token Balance: {admin.token_balance}")
        print(f"\nLogin with:")
        print(f"  Username: {username}")
        print(f"  Password: {password}")
        print(f"\n*** IMPORTANT: Change the password after first login! ***")

        return admin


async def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Create admin user")
    parser.add_argument("--email", default="admin@example.com", help="Admin email")
    parser.add_argument("--username", default="admin", help="Admin username")
    parser.add_argument("--password", default="admin123", help="Admin password")
    parser.add_argument("--tokens", type=int, default=1000, help="Initial token balance")

    args = parser.parse_args()

    await create_admin(
        email=args.email,
        username=args.username,
        password=args.password,
        token_balance=args.tokens,
    )


if __name__ == "__main__":
    asyncio.run(main())
