"""Authentication router for login, logout, and user management."""
import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.config import get_settings
from app.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    get_current_admin_user,
)
from app.models.user import User, TokenTransaction
from app.services.tokens import add_tokens

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()


# Request/Response schemas
class LoginRequest(BaseModel):
    """Login request schema."""
    username: str
    password: str


class LoginResponse(BaseModel):
    """Login response with JWT token."""
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    """User information response."""
    id: str
    email: str
    username: str
    token_balance: int
    is_active: bool
    is_admin: bool
    created_at: str

    model_config = {"from_attributes": True}


class CreateUserRequest(BaseModel):
    """Admin request to create a new user."""
    email: EmailStr
    username: str
    password: str
    token_balance: int = 100
    is_admin: bool = False


class UpdateTokensRequest(BaseModel):
    """Admin request to update user tokens."""
    amount: int  # Positive to add, can also set absolute value


class TokenTransactionResponse(BaseModel):
    """Token transaction history item."""
    id: str
    amount: int
    transaction_type: str
    reference_id: Optional[str]
    balance_after: int
    created_at: str

    model_config = {"from_attributes": True}


def _user_to_response(user: User) -> UserResponse:
    """Convert User model to response schema."""
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        token_balance=user.token_balance,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at.isoformat(),
    )


@router.post("/auth/login", response_model=LoginResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate user and return JWT token.

    Accepts username or email in the username field.
    """
    # Try to find user by username or email
    result = await db.execute(
        select(User).where(
            (User.username == request.username) | (User.email == request.username)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    # Create access token
    access_token = create_access_token(
        data={
            "sub": user.id,
            "username": user.username,
            "is_admin": user.is_admin,
        },
        expires_delta=timedelta(minutes=settings.jwt_expire_minutes),
    )

    logger.info(f"User {user.username} logged in successfully")

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=_user_to_response(user),
    )


@router.get("/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get the current authenticated user's information."""
    return _user_to_response(current_user)


@router.post("/auth/logout")
async def logout():
    """
    Logout endpoint.

    JWT is stateless, so this is mainly for client-side token clearing.
    The client should discard the token after calling this endpoint.
    """
    return {"message": "Logged out successfully"}


# Admin endpoints
@router.post("/admin/users", response_model=UserResponse)
async def create_user(
    request: CreateUserRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
):
    """Create a new user (admin only)."""
    # Check if email already exists
    result = await db.execute(
        select(User).where(User.email == request.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Check if username already exists
    result = await db.execute(
        select(User).where(User.username == request.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )

    # Create new user
    user = User(
        email=request.email,
        username=request.username,
        hashed_password=get_password_hash(request.password),
        token_balance=request.token_balance,
        is_admin=request.is_admin,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(f"Admin {admin_user.username} created user {user.username}")

    return _user_to_response(user)


@router.get("/admin/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
):
    """List all users (admin only)."""
    result = await db.execute(
        select(User).order_by(User.created_at.desc())
    )
    users = result.scalars().all()
    return [_user_to_response(u) for u in users]


@router.get("/admin/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
):
    """Get a specific user (admin only)."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return _user_to_response(user)


@router.put("/admin/users/{user_id}/tokens", response_model=UserResponse)
async def update_user_tokens(
    user_id: str,
    request: UpdateTokensRequest,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
):
    """Add tokens to a user's balance (admin only)."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Add tokens
    await add_tokens(user, request.amount, db, admin_user)
    await db.commit()
    await db.refresh(user)

    logger.info(
        f"Admin {admin_user.username} added {request.amount} tokens to user {user.username}"
    )

    return _user_to_response(user)


@router.put("/admin/users/{user_id}/status", response_model=UserResponse)
async def update_user_status(
    user_id: str,
    is_active: bool,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
):
    """Activate or deactivate a user (admin only)."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deactivating themselves
    if user.id == admin_user.id and not is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user.is_active = is_active
    await db.commit()
    await db.refresh(user)

    status_text = "activated" if is_active else "deactivated"
    logger.info(f"Admin {admin_user.username} {status_text} user {user.username}")

    return _user_to_response(user)


@router.get("/admin/users/{user_id}/transactions", response_model=list[TokenTransactionResponse])
async def get_user_transactions(
    user_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
):
    """Get token transaction history for a user (admin only)."""
    result = await db.execute(
        select(User).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(TokenTransaction)
        .where(TokenTransaction.user_id == user_id)
        .order_by(TokenTransaction.created_at.desc())
        .limit(limit)
    )
    transactions = result.scalars().all()

    return [
        TokenTransactionResponse(
            id=t.id,
            amount=t.amount,
            transaction_type=t.transaction_type,
            reference_id=t.reference_id,
            balance_after=t.balance_after,
            created_at=t.created_at.isoformat(),
        )
        for t in transactions
    ]
