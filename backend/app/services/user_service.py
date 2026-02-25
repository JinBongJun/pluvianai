from typing import Optional
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.subscription import Subscription
from app.infrastructure.repositories.user_repository import UserRepository
from app.infrastructure.repositories.exceptions import EntityAlreadyExistsError
from app.core.security import get_password_hash
from app.core.logging_config import logger
from datetime import datetime


class UserService:
    """Service for user management business logic"""

    def __init__(
        self,
        user_repo: UserRepository,
        db: Session
    ):
        self.user_repo = user_repo
        self.db = db

    def create_user(
        self,
        email: str,
        password: str,
        full_name: Optional[str] = None
    ) -> User:
        """
        Create a new user with hashed password
        
        Args:
            email: User email
            password: Plain text password (will be hashed)
            full_name: Optional full name
        
        Returns:
            Created User entity
        
        Raises:
            EntityAlreadyExistsError: If email already exists
        """
        # Check if user already exists
        existing = self.user_repo.find_by_email(email)
        if existing:
            raise EntityAlreadyExistsError("Email already registered")

        # Hash password
        hashed_password = get_password_hash(password)
        
        # Create user
        user = User(
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            is_active=True
        )
        user = self.user_repo.save(user)
        
        # Create free plan subscription for new user
        now = datetime.utcnow()
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)

        subscription = Subscription(
            user_id=user.id,
            plan_id="free",
            status="active",
            current_period_end=period_end,
        )
        self.db.add(subscription)
        # Transaction is managed by get_db() dependency
        
        logger.info(f"User created successfully: {user.email}")
        return user

    def get_user_by_id(self, user_id: int) -> Optional[User]:
        """Get user by ID"""
        return self.user_repo.find_by_id(user_id)

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        return self.user_repo.find_by_email(email)

    def update_user(
        self,
        user_id: int,
        full_name: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Optional[User]:
        """
        Update user
        
        Args:
            user_id: User ID
            full_name: Optional new full name
            is_active: Optional new active status
        
        Returns:
            Updated User entity or None if not found
        """
        user = self.user_repo.find_by_id(user_id)
        if not user:
            return None
        
        if full_name is not None:
            user.full_name = full_name
        if is_active is not None:
            user.is_active = is_active
        
        return self.user_repo.save(user)
