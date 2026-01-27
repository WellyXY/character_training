"""Normalize character status values."""
import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings


async def main() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                "UPDATE characters "
                "SET status = lower(status) "
                "WHERE status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')"
            )
        )
        updated = result.rowcount or 0
    await engine.dispose()
    print(f"Updated {updated} character status rows.")


if __name__ == \"__main__\":
    asyncio.run(main())
