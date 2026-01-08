"""
Script to create free plan subscriptions for existing users
Run this after adding the subscriptions table
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal
from app.models.user import User
from app.models.subscription import Subscription
from datetime import datetime

def migrate_existing_users():
    """Create free plan subscriptions for users who don't have one"""
    db = SessionLocal()
    
    try:
        # Find users without subscriptions
        users_without_subscription = db.query(User).filter(
            ~User.id.in_(db.query(Subscription.user_id).filter(Subscription.user_id.isnot(None)))
        ).all()
        
        if not users_without_subscription:
            print("All users already have subscriptions.")
            return
        
        now = datetime.utcnow()
        period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if now.month == 12:
            period_end = period_start.replace(year=now.year + 1, month=1)
        else:
            period_end = period_start.replace(month=now.month + 1)
        
        created_count = 0
        for user in users_without_subscription:
            subscription = Subscription(
                user_id=user.id,
                plan_type="free",
                status="active",
                current_period_start=period_start,
                current_period_end=period_end,
                cancel_at_period_end="false"
            )
            db.add(subscription)
            created_count += 1
        
        db.commit()
        print(f"✅ Created free plan subscriptions for {created_count} users")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    migrate_existing_users()

