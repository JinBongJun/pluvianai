#!/usr/bin/env python3
"""
Environment variable validation script
Checks that all required environment variables are set and valid
"""

import sys
import os
import re
from pathlib import Path
from urllib.parse import urlparse

# Add backend to path
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.logging_config import logger


def validate_database_url(url: str) -> tuple[bool, str]:
    """Validate PostgreSQL database URL"""
    if not url:
        return False, "DATABASE_URL is empty"
    
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ["postgresql", "postgresql+psycopg2"]:
            return False, f"Invalid database scheme: {parsed.scheme}. Expected postgresql or postgresql+psycopg2"
        if not parsed.hostname:
            return False, "Missing database hostname"
        return True, "Valid"
    except Exception as e:
        return False, f"Invalid DATABASE_URL format: {str(e)}"


def validate_redis_url(url: str) -> tuple[bool, str]:
    """Validate Redis URL"""
    if not url:
        return False, "REDIS_URL is empty"
    
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ["redis", "rediss"]:
            return False, f"Invalid Redis scheme: {parsed.scheme}. Expected redis or rediss"
        if not parsed.hostname:
            return False, "Missing Redis hostname"
        return True, "Valid"
    except Exception as e:
        return False, f"Invalid REDIS_URL format: {str(e)}"


def validate_secret_key(key: str) -> tuple[bool, str]:
    """Validate SECRET_KEY"""
    if not key:
        return False, "SECRET_KEY is empty"
    
    if len(key) < 32:
        return False, f"SECRET_KEY is too short ({len(key)} chars). Minimum 32 characters required for security"
    
    if key == "your-secret-key-change-in-production":
        return False, "SECRET_KEY is using default value. Change it in production!"
    
    return True, "Valid"


def validate_cors_origins(origins: str) -> tuple[bool, str]:
    """Validate CORS_ORIGINS"""
    if not origins:
        return False, "CORS_ORIGINS is empty"
    
    if origins.strip() == "*":
        return True, "Valid (allowing all origins - OK for development)"
    
    # Check if it's a comma-separated list of URLs
    origin_list = [o.strip() for o in origins.split(",") if o.strip()]
    for origin in origin_list:
        try:
            parsed = urlparse(origin)
            if parsed.scheme not in ["http", "https"]:
                return False, f"Invalid CORS origin scheme: {parsed.scheme} in {origin}"
            if not parsed.hostname:
                return False, f"Invalid CORS origin: {origin} (missing hostname)"
        except Exception as e:
            return False, f"Invalid CORS origin format: {origin}: {str(e)}"
    
    return True, f"Valid ({len(origin_list)} origins)"


def validate_paddle_config() -> tuple[bool, str]:
    """Validate Paddle Billing configuration (optional)"""
    api_key = getattr(settings, "PADDLE_API_KEY", None)
    if not api_key:
        return True, "Paddle not configured (optional)"

    if len(str(api_key).strip()) < 8:
        return False, "PADDLE_API_KEY looks invalid (too short)"

    webhook_secret = getattr(settings, "PADDLE_WEBHOOK_SECRET", None)
    if not webhook_secret:
        return True, "Paddle API key set; add PADDLE_WEBHOOK_SECRET for webhook verification"

    return True, "Valid"


def main():
    """Main validation function"""
    print("🔍 Checking environment variables...")
    print()
    
    errors = []
    warnings = []
    
    # Required environment variables
    checks = [
        ("DATABASE_URL", validate_database_url, True),
        ("REDIS_URL", validate_redis_url, True),
        ("SECRET_KEY", validate_secret_key, True),
        ("CORS_ORIGINS", validate_cors_origins, True),
    ]
    
    # Optional but recommended
    optional_checks = [
        ("Paddle Billing", validate_paddle_config, False),
    ]
    
    # Run required checks
    for name, validator, required in checks:
        value = getattr(settings, name, None)
        if not value and required:
            errors.append(f"❌ {name}: Missing (required)")
            continue
        
        if value:
            is_valid, message = validator(value)
            if is_valid:
                print(f"✅ {name}: {message}")
            else:
                if required:
                    errors.append(f"❌ {name}: {message}")
                else:
                    warnings.append(f"⚠️  {name}: {message}")
        else:
            if required:
                errors.append(f"❌ {name}: Missing (required)")
            else:
                warnings.append(f"⚠️  {name}: Not set (optional)")
    
    # Run optional checks
    for name, validator, required in optional_checks:
        is_valid, message = validator(None)
        if is_valid:
            print(f"✅ {name}: {message}")
        else:
            warnings.append(f"⚠️  {name}: {message}")
    
    # Check optional but important variables
    optional_vars = [
        "SENTRY_DSN",
        "RESEND_API_KEY",
        "SLACK_WEBHOOK_URL",
    ]
    
    for var_name in optional_vars:
        value = getattr(settings, var_name, None)
        if value:
            print(f"✅ {var_name}: Set")
        else:
            warnings.append(f"⚠️  {var_name}: Not set (optional but recommended)")
    
    print()
    
    # Print warnings
    if warnings:
        print("⚠️  Warnings:")
        for warning in warnings:
            print(f"   {warning}")
        print()
    
    # Print errors and exit
    if errors:
        print("❌ Errors found:")
        for error in errors:
            print(f"   {error}")
        print()
        print("Please fix the errors above before deploying.")
        sys.exit(1)
    
    print("✅ All required environment variables are valid!")
    if warnings:
        print("⚠️  Some optional variables are not set, but this is OK for development.")
    sys.exit(0)


if __name__ == "__main__":
    main()
