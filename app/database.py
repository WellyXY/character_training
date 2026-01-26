"""Database setup with SQLAlchemy async."""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.log_level == "DEBUG",
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all models."""
    pass


# Ensure all models are imported so metadata is complete
from app.models.file_blob import FileBlob  # noqa: F401


async def get_db() -> AsyncSession:
    """Dependency to get database session."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    """Initialize database tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Run migrations for existing tables
        await conn.run_sync(_run_migrations)


def _run_migrations(conn):
    """Run database migrations to add missing columns."""
    from sqlalchemy import text, inspect

    inspector = inspect(conn)

    # Check images table for missing columns
    if "images" in inspector.get_table_names():
        existing_columns = {col["name"] for col in inspector.get_columns("images")}

        # Add feedback_rating column if missing
        if "feedback_rating" not in existing_columns:
            conn.execute(text("ALTER TABLE images ADD COLUMN feedback_rating VARCHAR(10)"))

        # Add feedback_at column if missing
        if "feedback_at" not in existing_columns:
            conn.execute(text("ALTER TABLE images ADD COLUMN feedback_at DATETIME"))
