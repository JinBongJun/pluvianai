"""
Application configuration management
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
from pathlib import Path

# Find project root (where .env file should be located)
# This file is in backend/app/core/config.py, so go up 3 levels to reach backend/
# backend/app/core -> backend/app -> backend
PROJECT_ROOT = Path(__file__).parent.parent.parent
# Also consider the current working directory just in case
CWD = Path.cwd()


class Settings(BaseSettings):
    """Application settings"""

    # Application
    APP_NAME: str = "Pluvian Sentinel API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "development"  # development, staging, production
    PORT: int = 8000  # Railway/Vercel uses $PORT

    # Database
    # Standard local dev URL - ensures we don't accidentally use Railway internal URLs
    DATABASE_URL: str = "postgresql://pluvianai:pluvianai@localhost:5432/pluvianai"

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def force_local_db_if_internal(cls, v: str) -> str:
        # If running locally but environment has Railway internal URL, override it
        if "railway.internal" in v:
            return "postgresql://pluvianai:pluvianai@localhost:5432/pluvianai"
        return v

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    # Ingest queue (Phase 3: SDK api-calls pushed here, worker pops and persists)
    INGEST_QUEUE_KEY: str = "ingest:api_calls"

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"  # Should be changed in production
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Validate SECRET_KEY in production
        if self.ENVIRONMENT == "production" and self.SECRET_KEY == "your-secret-key-change-in-production":
            raise ValueError(
                "SECRET_KEY must be set to a secure value in production environment. "
                "Set SECRET_KEY environment variable to a random string (e.g., openssl rand -hex 32)"
            )
    ALGORITHM: str = "HS256"
    # Modern SaaS: Long-lived sessions (Vercel, Linear, Stripe pattern)
    # Short sessions frustrate users without meaningful security benefit
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days
    REFRESH_TOKEN_EXPIRE_DAYS: int = 90  # 90 days
    PASSWORD_POLICY_MIN_LENGTH: int = 12
    ENABLE_HIBP_CHECK: bool = False  # Optional: set True to enable Have I Been Pwned checks
    RECAPTCHA_SECRET: Optional[str] = None
    RECAPTCHA_MIN_SCORE: float = 0.5

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
    EMAIL_FROM_NAME: str = "PluvianAI"
    FEEDBACK_TO_EMAIL: Optional[str] = None  # If unset, defaults to EMAIL_FROM
    FEEDBACK_SLACK_WEBHOOK_URL: Optional[str] = None  # If set, feedback is sent to Slack instead of Resend
    # For uploading feedback attachments to Slack (optional; requires Bot Token with files:write)
    FEEDBACK_SLACK_BOT_TOKEN: Optional[str] = None
    FEEDBACK_SLACK_CHANNEL_ID: Optional[str] = None  # Channel ID where file will be posted (e.g. C01234567)

    # Slack configuration
    SLACK_WEBHOOK_URL: Optional[str] = None  # Slack webhook URL for notifications
    OPS_ALERT_WEBHOOK_URL: Optional[str] = None  # MVP ops alert webhook (Slack incoming webhook)
    OPS_ALERT_COOLDOWN_SECONDS: int = 600
    OPS_LIVE_VIEW_WINDOW_SECONDS: int = 300
    OPS_LIVE_VIEW_MIN_SAMPLES: int = 5  # require N requests in window before alerting (avoids 1 slow request = alert)
    OPS_LIVE_VIEW_5XX_RATE_THRESHOLD: float = 0.05
    OPS_LIVE_VIEW_P95_MS_THRESHOLD: int = 3000
    OPS_PROJECT_API_WINDOW_SECONDS: int = 300
    OPS_PROJECT_API_MIN_SAMPLES: int = 20
    OPS_PROJECT_API_5XX_RATE_THRESHOLD: float = 0.05
    OPS_PROJECT_API_P95_MS_THRESHOLD: int = 3000
    OPS_RELEASE_GATE_WINDOW_SECONDS: int = 600
    OPS_RELEASE_GATE_FAILURE_BURST_COUNT: int = 3
    OPS_RELEASE_GATE_RATIO_WINDOW_SECONDS: int = 3600
    OPS_RELEASE_GATE_RATIO_MIN_SAMPLES: int = 10
    OPS_RELEASE_GATE_FAIL_RATIO_THRESHOLD: float = 0.15
    OPS_PROVIDER_ERROR_WINDOW_SECONDS: int = 600
    OPS_PROVIDER_ERROR_BURST_COUNT: int = 5
    OPS_ALERT_META_WINDOW_SECONDS: int = 3600
    OPS_ALERT_META_FREQUENCY_THRESHOLD: int = 20
    OPS_DB_ERROR_WINDOW_SECONDS: int = 300
    OPS_DB_ERROR_BURST_COUNT: int = 10
    OPS_SNAPSHOT_WINDOW_SECONDS: int = 600
    OPS_SNAPSHOT_5XX_RATIO_THRESHOLD: float = 0.20
    OPS_SNAPSHOT_ERROR_MIN_SAMPLES: int = 20
    SOFT_DELETE_GRACE_DAYS: int = 30
    AGENT_SOFT_DELETE_GRACE_DAYS: int = 30
    AGENT_AUTO_RESTORE_DAYS: int = 30

    # Encryption for user API keys
    ENCRYPTION_KEY: Optional[str] = None  # Fernet key for encrypting user API keys (32-byte base64)

    # Stripe configuration (Billing)
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRICE_ID_INDIE: Optional[str] = None
    STRIPE_PRICE_ID_STARTUP: Optional[str] = None
    STRIPE_PRICE_ID_PRO: Optional[str] = None
    STRIPE_PRICE_ID_ENTERPRISE: Optional[str] = None

    # Free Plan Limits
    ENABLE_FREE_PLAN_HARD_LIMIT: bool = False  # If True, Free plan users are blocked when limits are exceeded

    # Sentry (Error Tracking)
    SENTRY_DSN: Optional[str] = None
    SENTRY_ENVIRONMENT: str = "production"  # production, staging, development
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1  # 10% of transactions for performance monitoring

    # Feature Flags (can be overridden by FEATURE_FLAG_* environment variables)
    FEATURE_FLAG_NEW_DASHBOARD: bool = False
    FEATURE_FLAG_ENHANCED_ANALYTICS: bool = False
    FEATURE_FLAG_BETA_FEATURES: bool = False
    FEATURE_FLAG_EXPERIMENTAL_API: bool = False

    # Release Gate policy flags
    # When False (default), production Release Gate should enforce pinned-only model ids for reproducibility.
    # When True, allow custom (non-pinned) model ids as an emergency escape hatch.
    RELEASE_GATE_ALLOW_CUSTOM_MODELS: bool = False

    # Release Gate async worker
    # Production-grade setup runs the job runner in a dedicated worker process,
    # not inside the web server process.
    RELEASE_GATE_JOB_RUNNER_ENABLED: bool = True

    # Monitoring (optional, for production)
    GRAFANA_URL: Optional[str] = None
    PROMETHEUS_URL: Optional[str] = None

    # Self-hosted mode (Enterprise only)
    SELF_HOSTED_MODE: bool = False
    SELF_HOSTED_LICENSE_KEY: Optional[str] = None

    # AWS S3 Glacier configuration (Enterprise only)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: Optional[str] = None
    S3_GLACIER_VAULT: Optional[str] = None

    # Database backup configuration
    BACKUP_DIR: str = "./backups"  # Directory for database backups

    model_config = SettingsConfigDict(
        # Try multiple .env locations
        env_file=(str(PROJECT_ROOT / ".env"), str(CWD / ".env"), ".env"),
        case_sensitive=False,  # Map secret_key to SECRET_KEY automatically
        extra="ignore",       # Do not fail on extra env vars like Port, User, etc.
    )

    @property
    def cors_origins_list(self) -> list[str]:

        # Handle empty or None values - default to "*" for flexibility
        cors_origins_str = str(self.CORS_ORIGINS).strip() if self.CORS_ORIGINS else "*"
        
        # If "*" is specified, return special marker
        if cors_origins_str == "*":
            return ["*"]

        origins = [origin.strip() for origin in cors_origins_str.split(",") if origin.strip()]
        # If parsing resulted in empty list, default to "*"
        if not origins:
            return ["*"]
        return origins


settings = Settings()
