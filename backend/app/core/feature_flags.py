"""
Feature flags for gradual rollout and A/B testing
"""
from typing import Optional, Dict, Any
from app.core.config import settings
from app.core.logging_config import logger
import os


class FeatureFlags:
    """Simple feature flag system using environment variables"""
    
    def __init__(self):
        self.flags: Dict[str, bool] = {}
        self._load_flags()
    
    def _load_flags(self):
        """Load feature flags from environment variables"""
        # Default flags (can be overridden by environment variables)
        default_flags = {
            "new_dashboard": False,
            "enhanced_analytics": False,
            "beta_features": False,
            "experimental_api": False,
        }
        
        # Load from environment variables (format: FEATURE_FLAG_<NAME>=true/false)
        for key, default_value in default_flags.items():
            env_key = f"FEATURE_FLAG_{key.upper()}"
            env_value = os.getenv(env_key, str(default_value)).lower()
            self.flags[key] = env_value in ("true", "1", "yes", "on")
            logger.info(f"Feature flag '{key}': {self.flags[key]}")
    
    def is_enabled(self, flag_name: str, user_id: Optional[int] = None) -> bool:
        """
        Check if a feature flag is enabled
        
        Args:
            flag_name: Name of the feature flag
            user_id: Optional user ID for user-specific flags
        
        Returns:
            True if feature is enabled, False otherwise
        """
        # Check if flag exists
        if flag_name not in self.flags:
            logger.warning(f"Unknown feature flag: {flag_name}")
            return False
        
        # For now, simple boolean check
        # In the future, can add user-specific or percentage-based rollout
        return self.flags.get(flag_name, False)
    
    def get_all_flags(self) -> Dict[str, bool]:
        """Get all feature flags"""
        return self.flags.copy()
    
    def reload(self):
        """Reload feature flags from environment"""
        self._load_flags()


# Global feature flags instance
feature_flags = FeatureFlags()
