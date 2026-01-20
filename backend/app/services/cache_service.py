"""
Redis caching service for optimizing database queries
"""

import json
from typing import Optional, Any, Dict
from datetime import timedelta
import redis
from app.core.config import settings


class CacheService:
    """Service for caching frequently accessed data"""

    def __init__(self):
        try:
            self.redis_client = redis.from_url(
                settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2, socket_timeout=2
            )
            # Test connection
            self.redis_client.ping()
            self.enabled = True
        except Exception:
            # If Redis is not available, disable caching
            self.redis_client = None
            self.enabled = False

    def get(self, key: str) -> Optional[Any]:
        """Get value from cache"""
        if not self.enabled:
            return None

        try:
            value = self.redis_client.get(key)
            if value:
                return json.loads(value)
        except Exception:
            # Graceful degradation: treat as cache miss
            return None
        return None

    def set(self, key: str, value: Any, ttl: int = 3600):  # Default 1 hour
        """Set value in cache with TTL"""
        if not self.enabled:
            return

        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
        except Exception:
            # Graceful degradation: ignore set errors
            return

    def delete(self, key: str):
        """Delete key from cache"""
        if not self.enabled:
            return

        try:
            self.redis_client.delete(key)
        except Exception:
            # Graceful degradation: ignore delete errors
            return

    def delete_pattern(self, pattern: str):
        """Delete all keys matching pattern"""
        if not self.enabled:
            return

        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                self.redis_client.delete(*keys)
        except Exception:
            # Graceful degradation: ignore delete errors
            return

    # Cache key generators
    @staticmethod
    def project_stats_key(project_id: int, days: int = 7) -> str:
        """Generate cache key for project statistics"""
        return f"project:{project_id}:stats:{days}d"

    @staticmethod
    def quality_scores_key(project_id: int, limit: int = 100) -> str:
        """Generate cache key for quality scores"""
        return f"project:{project_id}:quality:{limit}"

    @staticmethod
    def api_calls_key(project_id: int, limit: int = 100) -> str:
        """Generate cache key for API calls"""
        return f"project:{project_id}:api_calls:{limit}"

    @staticmethod
    def cost_analysis_key(project_id: int, days: int = 7) -> str:
        """Generate cache key for cost analysis"""
        return f"project:{project_id}:cost:{days}d"

    @staticmethod
    def project_members_key(project_id: int) -> str:
        """Generate cache key for project members"""
        return f"project:{project_id}:members"

    @staticmethod
    def project_list_key(user_id: int) -> str:
        """Generate cache key for user's project list"""
        return f"user:{user_id}:projects"

    def invalidate_project_cache(self, project_id: int):
        """Invalidate all cache entries for a project"""
        patterns = [
            f"project:{project_id}:*",
        ]
        for pattern in patterns:
            self.delete_pattern(pattern)

    def invalidate_user_projects_cache(self, user_id: int):
        """Invalidate user's project list cache"""
        self.delete(self.project_list_key(user_id))


# Global instance
cache_service = CacheService()
