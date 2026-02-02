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
    import logging

    logger = logging.getLogger(__name__)

    try:
        inspector = inspect(conn)
        dialect = conn.dialect.name  # 'postgresql' or 'sqlite'

        # Check images table for missing columns
        if "images" in inspector.get_table_names():
            existing_columns = {col["name"] for col in inspector.get_columns("images")}

            # Add feedback_rating column if missing
            if "feedback_rating" not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE images ADD COLUMN feedback_rating VARCHAR(10)"))
                    logger.info("Added feedback_rating column to images table")
                except Exception as e:
                    logger.warning(f"Could not add feedback_rating column: {e}")

            # Add feedback_at column if missing
            # PostgreSQL uses TIMESTAMP, SQLite uses DATETIME
            if "feedback_at" not in existing_columns:
                try:
                    timestamp_type = "TIMESTAMP" if dialect == "postgresql" else "DATETIME"
                    conn.execute(text(f"ALTER TABLE images ADD COLUMN feedback_at {timestamp_type}"))
                    logger.info("Added feedback_at column to images table")
                except Exception as e:
                    logger.warning(f"Could not add feedback_at column: {e}")

            # Add status column if missing (for tracking generating state)
            if "status" not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE images ADD COLUMN status VARCHAR(20) DEFAULT 'completed'"))
                    logger.info("Added status column to images table")
                except Exception as e:
                    logger.warning(f"Could not add status column: {e}")

            # Add task_id column if missing
            if "task_id" not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE images ADD COLUMN task_id VARCHAR(36)"))
                    logger.info("Added task_id column to images table")
                except Exception as e:
                    logger.warning(f"Could not add task_id column: {e}")

            # Add error_message column if missing
            if "error_message" not in existing_columns:
                try:
                    conn.execute(text("ALTER TABLE images ADD COLUMN error_message TEXT"))
                    logger.info("Added error_message column to images table")
                except Exception as e:
                    logger.warning(f"Could not add error_message column: {e}")

            # Make image_url nullable (needed for generating state)
            if dialect == "postgresql":
                try:
                    conn.execute(text("ALTER TABLE images ALTER COLUMN image_url DROP NOT NULL"))
                    logger.info("Made image_url nullable in images table")
                except Exception as e:
                    logger.warning(f"Could not make image_url nullable: {e}")

        # Make video_url nullable in videos table (needed for processing state)
        if "videos" in inspector.get_table_names():
            if dialect == "postgresql":
                try:
                    conn.execute(text("ALTER TABLE videos ALTER COLUMN video_url DROP NOT NULL"))
                    logger.info("Made video_url nullable in videos table")
                except Exception as e:
                    logger.warning(f"Could not make video_url nullable: {e}")

        # Convert PostgreSQL enum columns to VARCHAR for compatibility
        # This fixes the "operator does not exist: imagetype = character varying" error
        if dialect == "postgresql":
            enum_conversions = [
                ("images", "type", "VARCHAR(32)"),
                ("images", "status", "VARCHAR(16)"),
                ("videos", "type", "VARCHAR(16)"),
                ("videos", "status", "VARCHAR(16)"),
                ("sample_posts", "media_type", "VARCHAR(16)"),
                ("characters", "status", "VARCHAR(16)"),
            ]

            for table_name, col_name, new_type in enum_conversions:
                if table_name in inspector.get_table_names():
                    try:
                        # Check if column is USER-DEFINED (enum type)
                        result = conn.execute(text("""
                            SELECT data_type FROM information_schema.columns
                            WHERE table_name = :table AND column_name = :col
                        """), {"table": table_name, "col": col_name})
                        row = result.fetchone()
                        if row and row[0] == 'USER-DEFINED':
                            conn.execute(text(f"""
                                ALTER TABLE {table_name}
                                ALTER COLUMN {col_name} TYPE {new_type}
                                USING {col_name}::text
                            """))
                            logger.info(f"Converted {table_name}.{col_name} from enum to {new_type}")
                    except Exception as e:
                        logger.warning(f"Could not convert {table_name}.{col_name}: {e}")

            # Normalize enum values to lowercase
            # After enum-to-VARCHAR conversion, values may be uppercase (e.g. 'BASE' instead of 'base')
            lowercase_fixes = [
                ("images", "type"),
                ("images", "status"),
                ("videos", "type"),
                ("videos", "status"),
                ("sample_posts", "media_type"),
                ("characters", "status"),
            ]
            for table_name, col_name in lowercase_fixes:
                if table_name in inspector.get_table_names():
                    try:
                        conn.execute(text(f"""
                            UPDATE {table_name} SET {col_name} = LOWER({col_name})
                            WHERE {col_name} != LOWER({col_name})
                        """))
                        logger.info(f"Normalized {table_name}.{col_name} values to lowercase")
                    except Exception as e:
                        logger.warning(f"Could not normalize {table_name}.{col_name}: {e}")

    except Exception as e:
        logger.warning(f"Migration check failed: {e}")
