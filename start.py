#!/usr/bin/env python3
"""Start the server with the correct port from environment."""
import os
import asyncio
import uvicorn


async def create_default_admin():
    """Create default admin user from environment variables if not exists."""
    admin_username = os.environ.get("ADMIN_USERNAME")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_tokens = int(os.environ.get("ADMIN_TOKENS", "1000"))

    if not admin_username or not admin_password:
        print("No ADMIN_USERNAME/ADMIN_PASSWORD set, skipping admin creation")
        return

    # Import here to avoid circular imports
    from sqlalchemy import select
    from app.database import async_session, init_db
    from app.models.user import User
    from app.auth import get_password_hash

    await init_db()

    async with async_session() as db:
        # Check if admin already exists
        result = await db.execute(
            select(User).where(User.username == admin_username)
        )
        existing = result.scalar_one_or_none()

        if existing:
            print(f"Admin user '{admin_username}' already exists")
            return

        # Create admin user
        admin = User(
            email=admin_email,
            username=admin_username,
            hashed_password=get_password_hash(admin_password),
            token_balance=admin_tokens,
            is_admin=True,
            is_active=True,
        )
        db.add(admin)
        await db.commit()
        print(f"Admin user '{admin_username}' created with {admin_tokens} tokens")


if __name__ == "__main__":
    # Create admin user if environment variables are set
    asyncio.run(create_default_admin())

    # Start the server
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port)
