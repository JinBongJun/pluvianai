"""
Script to initialize database tables
Run this to create all tables including new Subscription and Usage tables
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, Base
from app.models import (
    User, Project, ProjectMember, APIKey, APICall,
    QualityScore, DriftDetection, Alert, Subscription, Usage
)

def init_database():
    """Create all database tables"""
    try:
        print("Creating database tables...")
        Base.metadata.create_all(bind=engine, checkfirst=True)
        print("✅ Database tables created successfully!")
        print("\nCreated tables:")
        print("  - users")
        print("  - projects")
        print("  - project_members")
        print("  - api_keys")
        print("  - api_calls")
        print("  - quality_scores")
        print("  - drift_detections")
        print("  - alerts")
        print("  - subscriptions")
        print("  - usage")
    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        raise

if __name__ == "__main__":
    init_database()

