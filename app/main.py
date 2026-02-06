"""FastAPI application entry point."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import init_db, get_db
from app.services.storage import get_storage_service

# Configure logging
settings = get_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def create_default_admin():
    """Create default admin user from environment variables if not exists."""
    import os
    from sqlalchemy import select
    from app.database import async_session
    from app.models.user import User
    from app.auth import get_password_hash

    admin_username = os.environ.get("ADMIN_USERNAME")
    admin_password = os.environ.get("ADMIN_PASSWORD")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
    admin_tokens = int(os.environ.get("ADMIN_TOKENS", "1000"))

    if not admin_username or not admin_password:
        logger.info("No ADMIN_USERNAME/ADMIN_PASSWORD set, skipping admin creation")
        return

    async with async_session() as db:
        result = await db.execute(
            select(User).where(User.username == admin_username)
        )
        existing = result.scalar_one_or_none()

        if existing:
            logger.info(f"Admin user '{admin_username}' already exists")
            return

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
        logger.info(f"Admin user '{admin_username}' created with {admin_tokens} tokens")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Starting application...")
    await init_db()
    logger.info("Database initialized")
    await create_default_admin()
    yield
    # Shutdown
    logger.info("Shutting down application...")


app = FastAPI(
    title="Character Training API",
    description="AI Character Creation and Content Generation",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
origins = settings.cors_origins.split(",") if settings.cors_origins != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https://.*\.up\.railway\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads are served from database via /uploads/{file_id}

# Import and include routers
from app.routers import characters, images, videos, agent, animate, samples, twitter, auth

app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(characters.router, prefix="/api/v1", tags=["characters"])
app.include_router(images.router, prefix="/api/v1", tags=["images"])
app.include_router(videos.router, prefix="/api/v1", tags=["videos"])
app.include_router(agent.router, prefix="/api/v1", tags=["agent"])
app.include_router(animate.router, prefix="/api/v1", tags=["animate"])
app.include_router(samples.router, prefix="/api/v1", tags=["samples"])
app.include_router(twitter.router, prefix="/api/v1", tags=["twitter"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": "Character Training API", "version": "1.0.0"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/uploads/{file_id}")
async def get_upload(
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve uploaded files stored in the database."""
    storage = get_storage_service()
    blob = await storage.get_file_blob(file_id, db)
    if not blob:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=blob.data, media_type=blob.content_type)
