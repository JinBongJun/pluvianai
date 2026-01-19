"""
Application configuration management
"""
from pydantic_settings import BaseSettings
from typing import Optional
from pathlib import Path


# Find project root (where .env file should be located)
# This file is in backend/app/core/config.py, so go up 4 levels to reach project root
# backend/app/core -> backend/app -> backend -> project root
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "AgentGuard API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, staging, production
    PORT: int = 8000  # Railway/Vercel uses $PORT
    
    # Database
    DATABASE_URL: str = "postgresql://agentguard:agentguard@localhost:5432/agentguard"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"  # Should be changed in production
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS - supports comma-separated list or single URL
    # Use "*" to allow all origins (for development/flexibility)
    # In production, specify exact domains for better security
    CORS_ORIGINS: str = "*"
    
    # API Keys (for LLM providers - optional)
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    # Frontend analytics keys (loaded from shared .env but not used in backend logic)
    NEXT_PUBLIC_POSTHOG_KEY: Optional[str] = None
    NEXT_PUBLIC_POSTHOG_HOST: Optional[str] = None
    
    # Email configuration (Resend)
    RESEND_API_KEY: Optional[str] = None
    EMAIL_FROM: Optional[str] = None  # e.g., "onboarding@resend.dev" or verified domain
    EMAIL_FROM_NAME: str = "AgentGuard"
    
    # Sentry (Error Tracking)
    SENTRY_DSN: Optional[str] = None
    SENTRY_ENVIRONMENT: str = "production"  # production, staging, development
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1  # 10% of transactions for performance monitoring
    
    # Feature Flags (can be overridden by FEATURE_FLAG_* environment variables)
    FEATURE_FLAG_NEW_DASHBOARD: bool = False
    FEATURE_FLAG_ENHANCED_ANALYTICS: bool = False
    FEATURE_FLAG_BETA_FEATURES: bool = False
    FEATURE_FLAG_EXPERIMENTAL_API: bool = False
    
    # Monitoring (optional, for production)
    GRAFANA_URL: Optional[str] = None
    PROMETHEUS_URL: Optional[str] = None
    
    class Config:
        env_file = str(PROJECT_ROOT / ".env")
        case_sensitive = True
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into list"""
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        
        # If "*" is specified, return special marker
        if self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        return origins


settings = Settings()


