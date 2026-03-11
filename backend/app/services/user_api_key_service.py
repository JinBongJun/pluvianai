"""
User API Key service for encrypting/decrypting user-provided API keys
"""

from typing import Optional
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
import base64
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.logging_config import logger
from app.models.user_api_key import UserApiKey


def _get_fernet_key() -> Fernet:
    """Get or generate Fernet encryption key"""
    encryption_key = settings.ENCRYPTION_KEY
    
    if not encryption_key:
        # Generate from SECRET_KEY if ENCRYPTION_KEY not set
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"pluvianai_salt",  # Fixed salt for consistency
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(settings.SECRET_KEY.encode()))
        return Fernet(key)
    
    # Use provided key (must be base64-encoded 32-byte key)
    try:
        return Fernet(encryption_key.encode())
    except Exception:
        # If invalid, generate from SECRET_KEY
        logger.warning("Invalid ENCRYPTION_KEY, generating from SECRET_KEY")
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"pluvianai_salt",
            iterations=100000,
            backend=default_backend()
        )
        key = base64.urlsafe_b64encode(kdf.derive(settings.SECRET_KEY.encode()))
        return Fernet(key)


class UserApiKeyService:
    """Service for managing user API keys"""

    def __init__(self, db: Session):
        self.db = db
        self.fernet = _get_fernet_key()

    def encrypt_key(self, api_key: str) -> str:
        """Encrypt an API key"""
        return self.fernet.encrypt(api_key.encode()).decode()

    def decrypt_key(self, encrypted_key: str) -> str:
        """Decrypt an API key"""
        return self.fernet.decrypt(encrypted_key.encode()).decode()

    def create_user_api_key(
        self,
        project_id: int,
        user_id: int,
        provider: str,
        api_key: str,
        name: Optional[str] = None,
        agent_id: Optional[str] = None,
    ) -> UserApiKey:
        """
        Create and encrypt a user API key
        
        Args:
            project_id: Project ID
            user_id: User ID
            provider: Provider name (openai, anthropic, google)
            api_key: Plain API key
            name: Optional name
            agent_id: Optional node(agent) scope; null means project default
        
        Returns:
            Created UserApiKey
        """
        # Encrypt the key
        encrypted = self.encrypt_key(api_key)

        normalized_agent_id = (agent_id or "").strip() or None

        # Deactivate existing keys for the same scope
        existing_query = (
            self.db.query(UserApiKey)
            .filter(
                UserApiKey.project_id == project_id,
                UserApiKey.provider == provider,
                UserApiKey.is_active.is_(True),
            )
        )
        if normalized_agent_id:
            existing_query = existing_query.filter(UserApiKey.agent_id == normalized_agent_id)
        else:
            existing_query = existing_query.filter(UserApiKey.agent_id.is_(None))
        existing = existing_query.all()
        for key in existing:
            key.is_active = False

        # Create new key
        user_key = UserApiKey(
            project_id=project_id,
            user_id=user_id,
            agent_id=normalized_agent_id,
            provider=provider,
            encrypted_key=encrypted,
            name=name or f"{provider} API key",
            is_active=True,
        )
        self.db.add(user_key)
        self.db.commit()

        logger.info(
            f"User API key created for project {project_id}, provider {provider}",
            extra={
                "project_id": project_id,
                "user_id": user_id,
                "provider": provider,
                "agent_id": normalized_agent_id,
            },
        )

        return user_key

    def get_user_api_key(
        self,
        project_id: int,
        provider: str,
        agent_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Get decrypted user API key for a project/provider
        
        Args:
            project_id: Project ID
            provider: Provider name
            agent_id: Optional node(agent) scope
        
        Returns:
            Decrypted API key or None
        """
        normalized_agent_id = (agent_id or "").strip() or None

        user_key = None
        if normalized_agent_id:
            user_key = (
                self.db.query(UserApiKey)
                .filter(
                    UserApiKey.project_id == project_id,
                    UserApiKey.provider == provider,
                    UserApiKey.agent_id == normalized_agent_id,
                    UserApiKey.is_active.is_(True),
                )
                .order_by(UserApiKey.created_at.desc())
                .first()
            )

        if not user_key:
            user_key = (
                self.db.query(UserApiKey)
                .filter(
                    UserApiKey.project_id == project_id,
                    UserApiKey.provider == provider,
                    UserApiKey.agent_id.is_(None),
                    UserApiKey.is_active.is_(True),
                )
                .order_by(UserApiKey.created_at.desc())
                .first()
            )

        if not user_key:
            return None

        try:
            return self.decrypt_key(user_key.encrypted_key)
        except Exception as e:
            logger.error(
                f"Failed to decrypt user API key: {str(e)}",
                extra={
                    "project_id": project_id,
                    "provider": provider,
                    "agent_id": normalized_agent_id,
                },
                exc_info=True,
            )
            return None

    def list_user_api_keys(
        self,
        project_id: int,
    ) -> list[UserApiKey]:
        """
        List user API keys for a project (without decryption)
        
        Args:
            project_id: Project ID
        
        Returns:
            List of UserApiKey (encrypted, not decrypted)
        """
        return (
            self.db.query(UserApiKey)
            .filter(UserApiKey.project_id == project_id)
            .order_by(UserApiKey.created_at.desc())
            .all()
        )

    def delete_user_api_key(
        self,
        key_id: int,
        user_id: int,
    ) -> bool:
        """
        Delete (deactivate) a user API key
        
        Args:
            key_id: Key ID
            user_id: User ID (for verification)
        
        Returns:
            True if deleted, False if not found
        """
        user_key = (
            self.db.query(UserApiKey)
            .filter(UserApiKey.id == key_id, UserApiKey.user_id == user_id)
            .first()
        )

        if not user_key:
            return False

        user_key.is_active = False
        self.db.commit()

        logger.info(
            f"User API key {key_id} deactivated",
            extra={"key_id": key_id, "user_id": user_id}
        )

        return True
