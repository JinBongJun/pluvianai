"""
Analytics service for tracking user behavior and system events
Integrates with PostHog for product analytics
"""

import asyncio
import httpx
import re
from typing import Dict, Any, Optional
from app.core.config import settings
from app.core.logging_config import logger

# PostHog API endpoint
POSTHOG_API_URL = "https://app.posthog.com/capture/"
SENSITIVE_KEY_PATTERN = re.compile(
    r"(email|token|secret|password|authorization|cookie|api[_-]?key|refresh_token|access_token)",
    re.IGNORECASE,
)
EMAIL_VALUE_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AnalyticsService:
    """Service for tracking analytics events"""

    def __init__(self):
        self.posthog_api_key = settings.NEXT_PUBLIC_POSTHOG_KEY
        self.enabled = bool(self.posthog_api_key)

    def _sanitize_value(self, key: str, value: Any) -> Any:
        if SENSITIVE_KEY_PATTERN.search(key):
            return "[REDACTED]"

        if isinstance(value, dict):
            return self._sanitize_properties(value)

        if isinstance(value, list):
            return [self._sanitize_value(key, item) for item in value[:20]]

        if isinstance(value, str):
            stripped = value.strip()
            if EMAIL_VALUE_PATTERN.match(stripped):
                return "[REDACTED]"
            if len(stripped) > 200:
                return stripped[:200]
            return stripped

        return value

    def _sanitize_properties(self, properties: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for key, value in (properties or {}).items():
            out[key] = self._sanitize_value(key, value)
        return out

    async def capture(
        self,
        event: str,
        properties: Optional[Dict[str, Any]] = None,
        distinct_id: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> bool:
        """
        Capture an analytics event
        
        Args:
            event: Event name (e.g., 'user_registered', 'api_call_made')
            properties: Optional event properties
            distinct_id: Optional distinct user ID (if not provided, uses user_id)
            user_id: Optional user ID
            
        Returns:
            True if event was sent successfully, False otherwise
        """
        if not self.enabled:
            return False

        try:
            sanitized_properties = self._sanitize_properties(properties)
            payload = {
                "api_key": self.posthog_api_key,
                "event": event,
                "properties": sanitized_properties,
                "distinct_id": distinct_id or (f"user_{user_id}" if user_id else "anonymous"),
            }

            if user_id:
                payload["properties"]["user_id"] = user_id

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(POSTHOG_API_URL, json=payload)
                response.raise_for_status()
                return True

        except Exception as e:
            logger.warning(f"Failed to send analytics event: {str(e)}")
            return False

    async def identify(
        self,
        distinct_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """
        Identify a user with properties
        
        Args:
            distinct_id: User identifier
            properties: User properties (email, name, plan, etc.)
            
        Returns:
            True if identification was sent successfully, False otherwise
        """
        if not self.enabled:
            return False

        try:
            payload = {
                "api_key": self.posthog_api_key,
                "event": "$identify",
                "distinct_id": distinct_id,
                "properties": properties or {},
            }

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(POSTHOG_API_URL, json=payload)
                response.raise_for_status()
                return True

        except Exception as e:
            logger.warning(f"Failed to identify user: {str(e)}")
            return False

    def track_user_registration(self, user_id: int, plan: str = "free") -> None:
        """Track user registration event"""
        asyncio.create_task(
            self.capture(
                event="user_registered",
                properties={"plan": plan},
                user_id=user_id,
            )
        )

    def track_user_login(self, user_id: int, method: str = "password") -> None:
        """Track user login event"""
        asyncio.create_task(
            self.capture(
                event="user_login",
                properties={"method": method},
                user_id=user_id,
            )
        )

    def track_project_created(self, user_id: int, project_id: int, project_name: str) -> None:
        """Track project creation event"""
        asyncio.create_task(
            self.capture(
                event="project_created",
                properties={"project_id": project_id, "project_name": project_name},
                user_id=user_id,
            )
        )

    def track_api_call(
        self,
        user_id: int,
        project_id: int,
        provider: str,
        model: str,
        latency_ms: float,
        status_code: int,
    ) -> None:
        """Track API call event (sampled to avoid overwhelming analytics)"""
        import random
        
        # Sample 10% of API calls to avoid overwhelming PostHog
        if random.random() > 0.1:
            return

        asyncio.create_task(
            self.capture(
                event="api_call_made",
                properties={
                    "project_id": project_id,
                    "provider": provider,
                    "model": model,
                    "latency_ms": latency_ms,
                    "status_code": status_code,
                },
                user_id=user_id,
            )
        )

    def track_feature_used(
        self,
        user_id: int,
        feature_name: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Track feature usage"""
        asyncio.create_task(
            self.capture(
                event="feature_used",
                properties={"feature": feature_name, **(properties or {})},
                user_id=user_id,
            )
        )

    def track_error(
        self,
        error_type: str,
        error_message: str,
        user_id: Optional[int] = None,
        project_id: Optional[int] = None,
    ) -> None:
        """Track error events"""
        asyncio.create_task(
            self.capture(
                event="error_occurred",
                properties={
                    "error_type": error_type,
                    "project_id": project_id,
                    "error_message": self._sanitize_value("error_message", error_message),
                },
                user_id=user_id,
            )
        )


# Global instance
analytics_service = AnalyticsService()
