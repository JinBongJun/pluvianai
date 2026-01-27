"""
Billing service for Stripe integration and real-time usage tracking
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from app.models.user import User
from app.models.subscription import Subscription
from app.core.subscription_limits import PLAN_LIMITS, PLAN_PRICING
from app.services.cache_service import cache_service
from app.core.config import settings
from app.core.logging_config import logger

try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    logger.warning("Stripe not installed. Billing features will be limited.")


class BillingService:
    """Service for billing and usage tracking"""

    def __init__(self, db: Session):
        self.db = db
        if STRIPE_AVAILABLE and settings.STRIPE_SECRET_KEY:
            stripe.api_key = settings.STRIPE_SECRET_KEY
            self.stripe_available = True
        else:
            self.stripe_available = False

    def get_current_usage(self, user_id: int) -> Dict[str, Any]:
        """
        Get current usage for user from Redis counters
        Returns real-time usage data
        """
        now = datetime.utcnow()
        today = now.strftime("%Y-%m-%d")
        year_month = now.strftime("%Y-%m")

        # Get usage from Redis
        daily_key = f"user:{user_id}:usage:daily:{today}"
        monthly_key = f"user:{user_id}:usage:monthly:{year_month}"
        judge_calls_key = f"user:{user_id}:judge_calls:monthly:{year_month}"
        snapshots_key = f"user:{user_id}:snapshots:monthly:{year_month}"

        daily_usage = int(cache_service.redis_client.get(daily_key) or 0) if cache_service.enabled else 0
        monthly_usage = int(cache_service.redis_client.get(monthly_key) or 0) if cache_service.enabled else 0
        judge_calls = int(cache_service.redis_client.get(judge_calls_key) or 0) if cache_service.enabled else 0
        snapshots = int(cache_service.redis_client.get(snapshots_key) or 0) if cache_service.enabled else 0

        # Get plan limits
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        plan_type = subscription.plan_type if subscription else "free"
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])

        # Get soft caps
        soft_caps = self._get_soft_caps(plan_type)

        return {
            "daily_usage": daily_usage,
            "monthly_usage": monthly_usage,
            "judge_calls": judge_calls,
            "snapshots": snapshots,
            "plan_type": plan_type,
            "limits": {
                "api_calls_per_month": limits.get("api_calls_per_month", 1000),
                "snapshots_per_month": soft_caps.get("snapshots", 500),
                "judge_calls_per_month": soft_caps.get("judge_calls", 100),
            },
            "soft_caps": soft_caps,
        }

    def increment_usage(
        self,
        user_id: int,
        metric_type: str,
        amount: int = 1,
        project_id: Optional[int] = None
    ) -> Tuple[bool, Optional[str]]:
        """
        Increment usage counter in Redis
        Returns: (is_allowed, warning_message)
        """
        if not cache_service.enabled:
            # If Redis is not available, allow but log warning
            logger.warning(f"Redis not available, usage tracking disabled for user {user_id}")
            return (True, None)

        now = datetime.utcnow()
        today = now.strftime("%Y-%m-%d")
        year_month = now.strftime("%Y-%m")

        # Get plan limits
        subscription = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        plan_type = subscription.plan_type if subscription else "free"
        limits = PLAN_LIMITS.get(plan_type, PLAN_LIMITS["free"])
        soft_caps = self._get_soft_caps(plan_type)

        # Determine which counter to use
        if metric_type == "api_calls":
            counter_key = f"user:{user_id}:usage:monthly:{year_month}"
            limit = limits.get("api_calls_per_month", 1000)
        elif metric_type == "snapshots":
            counter_key = f"user:{user_id}:snapshots:monthly:{year_month}"
            limit = soft_caps.get("snapshots", 500)
        elif metric_type == "judge_calls":
            counter_key = f"user:{user_id}:judge_calls:monthly:{year_month}"
            limit = soft_caps.get("judge_calls", 100)
        else:
            # Unknown metric type, allow but don't track
            return (True, None)

        # Handle unlimited (-1)
        if limit == -1:
            # Still increment counter for tracking
            current = cache_service.redis_client.incrby(counter_key, amount)
            # Set expiration to end of month
            cache_service.redis_client.expire(counter_key, self._get_seconds_until_month_end())
            return (True, None)

        # Check current usage
        current = int(cache_service.redis_client.get(counter_key) or 0)
        new_total = current + amount

        # Check if limit exceeded
        if new_total > limit:
            # Check if hard limit is enabled for Free plan
            if plan_type == "free" and settings.ENABLE_FREE_PLAN_HARD_LIMIT:
                # Hard limit: block the operation
                error_message = f"Free plan limit exceeded: {current} / {limit} {metric_type}. Please upgrade your plan to continue."
                logger.warning(f"User {user_id} blocked by hard limit for {metric_type}: {current}/{limit}")
                return (False, error_message)
            else:
                # Soft cap exceeded - allow but warn
                warning = f"Soft cap exceeded: {new_total} / {limit} {metric_type}. Consider upgrading."
                
                # Still increment for tracking
                cache_service.redis_client.incrby(counter_key, amount)
                cache_service.redis_client.expire(counter_key, self._get_seconds_until_month_end())
                
                # Log for billing
                logger.warning(f"User {user_id} exceeded soft cap for {metric_type}: {new_total}/{limit}")
                
                return (True, warning)

        # Increment counter
        cache_service.redis_client.incrby(counter_key, amount)
        cache_service.redis_client.expire(counter_key, self._get_seconds_until_month_end())

        # Also track daily usage for api_calls
        if metric_type == "api_calls":
            daily_key = f"user:{user_id}:usage:daily:{now.strftime('%Y-%m-%d')}"
            cache_service.redis_client.incrby(daily_key, amount)
            cache_service.redis_client.expire(daily_key, 86400)  # 24 hours

        return (True, None)

    def _get_soft_caps(self, plan_type: str) -> Dict[str, int]:
        """Get soft caps for plan (Fair Use Policy)"""
        soft_caps = {
            "free": {
                "snapshots": 500,
                "judge_calls": 100,
            },
            "indie": {
                "snapshots": 10000,
                "judge_calls": 1000,
            },
            "startup": {
                "snapshots": 50000,
                "judge_calls": 10000,
            },
            "pro": {
                "snapshots": 100000,  # Soft cap (Fair Use Policy)
                "judge_calls": 100000,  # Soft cap
            },
            "enterprise": {
                "snapshots": 1000000,  # Soft cap
                "judge_calls": 1000000,  # Soft cap
            },
        }
        return soft_caps.get(plan_type, soft_caps["free"])

    def _get_seconds_until_month_end(self) -> int:
        """Calculate seconds until end of current month"""
        now = datetime.utcnow()
        if now.month == 12:
            next_month = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0)
        else:
            next_month = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0)
        
        delta = next_month - now
        return int(delta.total_seconds())

    def check_soft_cap_exceeded(self, user_id: int, metric_type: str) -> Tuple[bool, Optional[str]]:
        """
        Check if user has exceeded soft cap
        Returns: (exceeded, message)
        """
        usage = self.get_current_usage(user_id)
        plan_type = usage["plan_type"]
        soft_caps = self._get_soft_caps(plan_type)

        if metric_type == "snapshots":
            current = usage["snapshots"]
            limit = soft_caps.get("snapshots", 500)
        elif metric_type == "judge_calls":
            current = usage["judge_calls"]
            limit = soft_caps.get("judge_calls", 100)
        else:
            return (False, None)

        if current > limit:
            return (True, f"Soft cap exceeded: {current} / {limit}. Fair Use Policy applies.")
        
        return (False, None)

    def create_stripe_checkout_session(
        self,
        user_id: int,
        plan_type: str,
        success_url: str,
        cancel_url: str
    ) -> Optional[Dict[str, Any]]:
        """Create Stripe checkout session for subscription"""
        if not self.stripe_available:
            logger.error("Stripe not available")
            return None

        try:
            price_id = self._get_stripe_price_id(plan_type)
            if not price_id:
                logger.error(f"No Stripe price ID for plan {plan_type}")
                return None

            # Get or create Stripe customer
            customer_id = self._get_or_create_stripe_customer(user_id)
            if not customer_id:
                logger.error(f"Failed to get or create Stripe customer for user {user_id}")
                return None

            session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=["card"],
                line_items=[{
                    "price": price_id,
                    "quantity": 1,
                }],
                mode="subscription",
                success_url=success_url,
                cancel_url=cancel_url,
                metadata={
                    "user_id": str(user_id),
                    "plan_type": plan_type,
                },
            )
            return {
                "session_id": session.id,
                "url": session.url,
            }
        except Exception as e:
            logger.error(f"Failed to create Stripe checkout session: {str(e)}")
            return None

    def handle_stripe_webhook(self, payload: bytes, signature: str) -> Dict[str, Any]:
        """Handle Stripe webhook events"""
        if not self.stripe_available:
            return {"error": "Stripe not available"}

        try:
            event = stripe.Webhook.construct_event(
                payload, signature, settings.STRIPE_WEBHOOK_SECRET
            )
        except ValueError:
            return {"error": "Invalid payload"}
        except stripe.error.SignatureVerificationError:
            return {"error": "Invalid signature"}

        # Handle different event types
        if event["type"] == "checkout.session.completed":
            session = event["data"]["object"]
            user_id = int(session["metadata"]["user_id"])
            plan_type = session["metadata"]["plan_type"]
            
            # Update user subscription
            from app.services.subscription_service import SubscriptionService
            subscription_service = SubscriptionService(self.db)
            subscription_service.create_or_update_subscription(
                user_id=user_id,
                plan_type=plan_type,
                status="active",
            )
            
            logger.info(
                f"Subscription updated via webhook for user {user_id}: {plan_type}",
                extra={"user_id": user_id, "plan_type": plan_type, "event_type": event["type"]}
            )
            
            return {"status": "success", "message": "Subscription updated", "event_type": event["type"]}
        
        elif event["type"] == "customer.subscription.updated":
            # Handle subscription updates (plan changes, renewals, etc.)
            subscription = event["data"]["object"]
            customer_id = subscription.get("customer")
            
            if not customer_id:
                logger.error("Subscription updated event missing customer ID")
                return {"status": "error", "message": "Missing customer ID", "event_type": event["type"]}
            
            # Get user by Stripe customer ID
            user = self._get_user_by_stripe_customer_id(customer_id)
            if not user:
                logger.warning(f"User not found for Stripe customer {customer_id}")
                return {"status": "error", "message": "User not found", "event_type": event["type"]}
            
            try:
                # Extract subscription information
                subscription_status = subscription.get("status")  # active, canceled, past_due, etc.
                items = subscription.get("items", {}).get("data", [])
                price_id = items[0].get("price", {}).get("id") if items else None
                
                if not price_id:
                    logger.error(f"Subscription {subscription.get('id')} missing price ID")
                    return {"status": "error", "message": "Missing price ID", "event_type": event["type"]}
                
                # Map price ID to plan type
                plan_type = self._map_price_id_to_plan_type(price_id)
                if not plan_type:
                    logger.error(f"Unknown price ID: {price_id}")
                    return {"status": "error", "message": "Unknown price ID", "event_type": event["type"]}
                
                # Extract period dates
                current_period_start = datetime.fromtimestamp(
                    subscription.get("current_period_start", 0)
                ) if subscription.get("current_period_start") else None
                current_period_end = datetime.fromtimestamp(
                    subscription.get("current_period_end", 0)
                ) if subscription.get("current_period_end") else None
                
                # Update subscription
                from app.services.subscription_service import SubscriptionService
                subscription_service = SubscriptionService(self.db)
                subscription_service.create_or_update_subscription(
                    user_id=user.id,
                    plan_type=plan_type,
                    status=subscription_status,
                    current_period_start=current_period_start,
                    current_period_end=current_period_end,
                )
                
                logger.info(
                    f"Subscription updated via webhook for user {user.id}: {plan_type} ({subscription_status})",
                    extra={
                        "user_id": user.id,
                        "plan_type": plan_type,
                        "status": subscription_status,
                        "event_type": event["type"],
                        "subscription_id": subscription.get("id")
                    }
                )
                
                return {"status": "success", "message": "Subscription updated", "event_type": event["type"]}
            except Exception as e:
                logger.error(f"Error processing subscription update: {str(e)}", exc_info=True)
                return {"status": "error", "message": str(e), "event_type": event["type"]}
        
        elif event["type"] == "customer.subscription.deleted":
            # Handle subscription cancellations
            subscription = event["data"]["object"]
            customer_id = subscription.get("customer")
            
            if not customer_id:
                logger.error("Subscription deleted event missing customer ID")
                return {"status": "error", "message": "Missing customer ID", "event_type": event["type"]}
            
            # Get user by Stripe customer ID
            user = self._get_user_by_stripe_customer_id(customer_id)
            if not user:
                logger.warning(f"User not found for Stripe customer {customer_id}")
                return {"status": "error", "message": "User not found", "event_type": event["type"]}
            
            try:
                # Update subscription status to cancelled
                from app.services.subscription_service import SubscriptionService
                subscription_service = SubscriptionService(self.db)
                subscription_service.create_or_update_subscription(
                    user_id=user.id,
                    plan_type="free",  # Downgrade to free plan
                    status="cancelled",
                )
                
                logger.info(
                    f"Subscription cancelled via webhook for user {user.id}",
                    extra={
                        "user_id": user.id,
                        "event_type": event["type"],
                        "subscription_id": subscription.get("id")
                    }
                )
                
                return {"status": "success", "message": "Subscription cancelled", "event_type": event["type"]}
            except Exception as e:
                logger.error(f"Error processing subscription cancellation: {str(e)}", exc_info=True)
                return {"status": "error", "message": str(e), "event_type": event["type"]}

        logger.info(f"Unhandled Stripe webhook event type: {event['type']}")
        return {"status": "ignored", "message": f"Event type {event['type']} not handled", "event_type": event["type"]}

    def _get_stripe_price_id(self, plan_type: str) -> Optional[str]:
        """Get Stripe price ID for plan (configured in Stripe dashboard)"""
        # These should be configured in Stripe dashboard and stored in environment variables
        price_ids = {
            "indie": getattr(settings, "STRIPE_PRICE_ID_INDIE", None),
            "startup": getattr(settings, "STRIPE_PRICE_ID_STARTUP", None),
            "pro": getattr(settings, "STRIPE_PRICE_ID_PRO", None),
            "enterprise": getattr(settings, "STRIPE_PRICE_ID_ENTERPRISE", None),
        }
        return price_ids.get(plan_type)

    def _get_user_email(self, user_id: int) -> Optional[str]:
        """Get user email for Stripe"""
        user = self.db.query(User).filter(User.id == user_id).first()
        return user.email if user else None

    def _get_or_create_stripe_customer(self, user_id: int) -> Optional[str]:
        """
        Get or create Stripe customer for user
        Returns Stripe customer ID or None on failure
        """
        if not self.stripe_available:
            return None
        
        try:
            user = self.db.query(User).filter(User.id == user_id).first()
            if not user:
                logger.error(f"User {user_id} not found")
                return None
            
            # If user already has a Stripe customer ID, return it
            if user.stripe_customer_id:
                return user.stripe_customer_id
            
            # Create new Stripe customer
            customer = stripe.Customer.create(
                email=user.email,
                metadata={
                    "user_id": str(user_id),
                }
            )
            
            # Save customer ID to user
            user.stripe_customer_id = customer.id
            self.db.commit()
            self.db.refresh(user)
            
            logger.info(f"Created Stripe customer {customer.id} for user {user_id}")
            return customer.id
            
        except Exception as e:
            logger.error(f"Failed to get or create Stripe customer for user {user_id}: {str(e)}", exc_info=True)
            self.db.rollback()
            return None

    def _get_user_by_stripe_customer_id(self, customer_id: str) -> Optional[User]:
        """
        Get user by Stripe customer ID
        Returns User object or None if not found
        """
        try:
            user = self.db.query(User).filter(User.stripe_customer_id == customer_id).first()
            return user
        except Exception as e:
            logger.error(f"Error looking up user by Stripe customer ID {customer_id}: {str(e)}", exc_info=True)
            return None

    def _map_price_id_to_plan_type(self, price_id: str) -> Optional[str]:
        """
        Map Stripe price ID to plan type (reverse mapping)
        Returns plan type string or None if not found
        """
        price_id_to_plan = {
            getattr(settings, "STRIPE_PRICE_ID_INDIE", None): "indie",
            getattr(settings, "STRIPE_PRICE_ID_STARTUP", None): "startup",
            getattr(settings, "STRIPE_PRICE_ID_PRO", None): "pro",
            getattr(settings, "STRIPE_PRICE_ID_ENTERPRISE", None): "enterprise",
        }
        
        # Remove None values
        price_id_to_plan = {k: v for k, v in price_id_to_plan.items() if k is not None}
        
        return price_id_to_plan.get(price_id)
