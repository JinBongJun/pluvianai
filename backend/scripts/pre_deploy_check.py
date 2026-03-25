#!/usr/bin/env python3
"""
Pre-deployment validation script
Checks database, Redis, migrations, and core services before deployment
"""

import sys
import asyncio
from pathlib import Path

# Add backend to path
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import get_db, check_database_health, engine
from app.core.config import settings
from app.core.logging_config import logger
from app.services.cache_service import cache_service
import redis
from sqlalchemy import text


def check_database_connection():
    """Check database connection and basic queries"""
    print("🔍 Checking database connection...")
    try:
        # Check database health
        is_healthy, message = check_database_health()
        if not is_healthy:
            print(f"❌ Database health check failed: {message}")
            return False
        
        # Try a simple query
        db = next(get_db())
        try:
            result = db.execute(text("SELECT 1"))
            result.fetchone()
            print("✅ Database connection: OK")
            return True
        finally:
            db.close()
    except Exception as e:
        print(f"❌ Database connection failed: {str(e)}")
        return False


def check_redis_connection():
    """Check Redis connection"""
    print("🔍 Checking Redis connection...")
    try:
        if not cache_service.enabled:
            print("⚠️  Redis cache is disabled (REDIS_URL not set or invalid)")
            return True  # Not a critical error
        
        # Try to ping Redis
        if cache_service.redis_client:
            cache_service.redis_client.ping()
            print("✅ Redis connection: OK")
            return True
        else:
            print("⚠️  Redis client not initialized")
            return True  # Not critical
    except redis.ConnectionError as e:
        print(f"❌ Redis connection failed: {str(e)}")
        return False
    except Exception as e:
        print(f"⚠️  Redis check error: {str(e)}")
        return True  # Not critical for deployment


def check_migrations():
    """Check Alembic migration status"""
    print("🔍 Checking database migrations...")
    try:
        from alembic.config import Config
        from alembic import command
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        
        alembic_cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
        
        # Get current revision
        db = next(get_db())
        try:
            context = MigrationContext.configure(db.connection())
            current_rev = context.get_current_revision()
            
            # Get head revision
            script = ScriptDirectory.from_config(alembic_cfg)
            head_rev = script.get_current_head()
            
            if current_rev == head_rev:
                print(f"✅ Database migrations: Up to date (revision: {current_rev})")
                return True
            else:
                print(f"⚠️  Database migrations: Not at head")
                print(f"   Current: {current_rev}")
                print(f"   Head: {head_rev}")
                print(f"   Run: alembic upgrade head")
                return False
        finally:
            db.close()
    except Exception as e:
        print(f"⚠️  Migration check error: {str(e)}")
        print("   This is not critical, but migrations should be checked manually")
        return True  # Not critical


def check_core_services():
    """Check that core services can be initialized"""
    print("🔍 Checking core services...")
    try:
        # Check cache service
        if cache_service.enabled:
            print("✅ Cache service: Enabled")
        else:
            print("⚠️  Cache service: Disabled (Redis not configured)")
        
        # Check other services (just import to verify they can be initialized)
        from app.services.alert_service import AlertService
        from app.services.firewall_service import firewall_service
        from app.services.snapshot_service import SnapshotService
        
        print("✅ Core services: Can be initialized")
        return True
    except Exception as e:
        print(f"❌ Core services check failed: {str(e)}")
        return False


def check_environment():
    """Check environment configuration"""
    print("🔍 Checking environment configuration...")
    
    issues = []
    
    # Check if in production mode
    if settings.ENVIRONMENT == "production":
        if settings.DEBUG:
            issues.append("DEBUG is True in production (security risk)")
        
        if settings.SECRET_KEY == "your-secret-key-change-in-production":
            issues.append("SECRET_KEY is using default value (security risk)")
        
        if settings.CORS_ORIGINS == "*":
            issues.append("CORS_ORIGINS is '*' in production (security risk)")

        if settings.expose_api_docs:
            issues.append("API docs are exposed in production (security risk)")

        if settings.expose_metrics_endpoint:
            issues.append("Metrics endpoint is exposed in production (security risk)")

        if settings.expose_detailed_health_endpoint:
            issues.append("Detailed health endpoint is exposed in production (security risk)")
    
    if issues:
        print("⚠️  Environment issues found:")
        for issue in issues:
            print(f"   - {issue}")
        return False
    else:
        print(f"✅ Environment: {settings.ENVIRONMENT}")
        return True


def main():
    """Main validation function"""
    print("🚀 Pre-deployment validation")
    print("=" * 50)
    print()
    
    checks = [
        ("Environment", check_environment),
        ("Database Connection", check_database_connection),
        ("Redis Connection", check_redis_connection),
        ("Migrations", check_migrations),
        ("Core Services", check_core_services),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append((name, result))
        except Exception as e:
            print(f"❌ {name} check crashed: {str(e)}")
            results.append((name, False))
        print()
    
    # Summary
    print("=" * 50)
    print("📊 Summary:")
    print()
    
    all_passed = True
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status}: {name}")
        if not result:
            all_passed = False
    
    print()
    
    if all_passed:
        print("✅ All checks passed! Ready for deployment.")
        sys.exit(0)
    else:
        print("❌ Some checks failed. Please fix the issues above before deploying.")
        sys.exit(1)


if __name__ == "__main__":
    main()
