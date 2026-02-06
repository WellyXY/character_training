"""Token management service for handling token deductions and refunds."""
import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, TokenTransaction

logger = logging.getLogger(__name__)

# Token costs for different operations
TOKEN_COSTS = {
    "image_generation": 1,
    "video_generation": 2,
}


class InsufficientTokensError(Exception):
    """Raised when user doesn't have enough tokens."""
    def __init__(self, required: int, available: int):
        self.required = required
        self.available = available
        super().__init__(f"Insufficient tokens: required {required}, available {available}")


async def check_tokens(
    user: User,
    operation: str,
    db: AsyncSession,
) -> int:
    """
    Check if user has enough tokens for the operation.

    Args:
        user: The user to check
        operation: Type of operation (image_generation, video_generation)
        db: Database session

    Returns:
        Required token amount

    Raises:
        HTTPException with 402 status if insufficient tokens
    """
    cost = TOKEN_COSTS.get(operation, 1)

    if user.token_balance < cost:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "insufficient_tokens",
                "message": f"Insufficient tokens. Required: {cost}, Available: {user.token_balance}",
                "required": cost,
                "available": user.token_balance,
            }
        )

    return cost


async def deduct_tokens(
    user: User,
    operation: str,
    db: AsyncSession,
    reference_id: Optional[str] = None,
) -> TokenTransaction:
    """
    Deduct tokens from user's balance and record the transaction.

    Args:
        user: The user to deduct from
        operation: Type of operation (image_generation, video_generation)
        db: Database session
        reference_id: Optional reference to the generated content (image_id, video_id)

    Returns:
        The created TokenTransaction record

    Raises:
        HTTPException with 402 status if insufficient tokens
    """
    cost = TOKEN_COSTS.get(operation, 1)

    # Check balance
    if user.token_balance < cost:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "insufficient_tokens",
                "message": f"Insufficient tokens. Required: {cost}, Available: {user.token_balance}",
                "required": cost,
                "available": user.token_balance,
            }
        )

    # Deduct tokens
    user.token_balance -= cost
    balance_after = user.token_balance

    # Create transaction record
    transaction = TokenTransaction(
        user_id=user.id,
        amount=-cost,  # Negative for deductions
        transaction_type=operation,
        reference_id=reference_id,
        balance_after=balance_after,
    )
    db.add(transaction)

    logger.info(
        f"Deducted {cost} tokens from user {user.username} for {operation}. "
        f"Balance: {balance_after}"
    )

    return transaction


async def refund_tokens(
    user: User,
    operation: str,
    db: AsyncSession,
    reference_id: Optional[str] = None,
) -> TokenTransaction:
    """
    Refund tokens to user's balance (e.g., when generation fails).

    Args:
        user: The user to refund to
        operation: Type of operation that was refunded
        db: Database session
        reference_id: Optional reference to the failed content

    Returns:
        The created TokenTransaction record
    """
    cost = TOKEN_COSTS.get(operation, 1)

    # Add tokens back
    user.token_balance += cost
    balance_after = user.token_balance

    # Create transaction record
    transaction = TokenTransaction(
        user_id=user.id,
        amount=cost,  # Positive for refunds
        transaction_type=f"{operation}_refund",
        reference_id=reference_id,
        balance_after=balance_after,
    )
    db.add(transaction)

    logger.info(
        f"Refunded {cost} tokens to user {user.username} for failed {operation}. "
        f"Balance: {balance_after}"
    )

    return transaction


async def add_tokens(
    user: User,
    amount: int,
    db: AsyncSession,
    admin_user: Optional[User] = None,
) -> TokenTransaction:
    """
    Add tokens to user's balance (admin top-up).

    Args:
        user: The user to add tokens to
        amount: Number of tokens to add
        db: Database session
        admin_user: The admin performing the top-up

    Returns:
        The created TokenTransaction record
    """
    # Add tokens
    user.token_balance += amount
    balance_after = user.token_balance

    # Create transaction record
    transaction = TokenTransaction(
        user_id=user.id,
        amount=amount,
        transaction_type="admin_topup",
        reference_id=admin_user.id if admin_user else None,
        balance_after=balance_after,
    )
    db.add(transaction)

    logger.info(
        f"Added {amount} tokens to user {user.username} by admin "
        f"{admin_user.username if admin_user else 'system'}. Balance: {balance_after}"
    )

    return transaction
