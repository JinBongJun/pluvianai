"""
Application configuration management
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings"""
    
    # Application
    APP_NAME: str = "AgentGuard API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
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
    # Default includes localhost and common Vercel patterns
    CORS_ORIGINS: str = "http://localhost:3000,https://*.vercel.app"
    
    # API Keys (for LLM providers - optional)
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS_ORIGINS string into list"""
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        
        # Handle wildcard patterns for Vercel
        # FastAPI doesn't support wildcards directly, so we need to allow all origins
        # if a wildcard pattern is detected, or use regex patterns
        has_wildcard = any("*" in origin for origin in origins)
        
        if has_wildcard:
            # If wildcard is present, allow all origins (for development/production flexibility)
            # In production, you should specify exact domains
            return ["*"]
        
        return origins


settings = Settings()


