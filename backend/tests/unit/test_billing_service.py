"""
Unit tests for BillingService
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime
from app.services.billing_service import BillingService
from app.models.user import User
from app.models.subscription import Subscription
from app.services.cache_service import cache_service


@pytest.mark.unit
class TestBillingService:
    """Tests for Billing Service"""

    @pytest.fixture
    def mock_redis(self):
        """Mock Redis client"""
        mock_redis = MagicMock()
        mock_redis.get.return_value = "0"
        mock_redis.incrby.return_value = 1
        mock_redis.expire.return_value = True
        return mock_redis

    @pytest.fixture
    def service(self, db):
        """Create BillingService instance"""
        return BillingService(db)

    def test_get_current_usage_success(self, db, test_user, mock_redis):
        """Test getting current usage with Redis enabled"""
        service = BillingService(db)
        
        # Create subscription
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                mock_redis.get.side_effect = ["100", "500", "10", "50"]  # daily, monthly, judge, snapshots
                
                result = service.get_current_usage(test_user.id)
                
                assert "daily_usage" in result
                assert "monthly_usage" in result
                assert "judge_calls" in result
                assert "snapshots" in result
                assert result["plan_type"] == "free"
                assert "limits" in result
                assert "soft_caps" in result

    def test_get_current_usage_redis_disabled(self, db, test_user):
        """Test getting usage when Redis is disabled"""
        service = BillingService(db)
        
        with patch.object(cache_service, 'enabled', False):
            result = service.get_current_usage(test_user.id)
            
            assert result["daily_usage"] == 0
            assert result["monthly_usage"] == 0
            assert result["judge_calls"] == 0
            assert result["snapshots"] == 0

    def test_get_current_usage_no_subscription(self, db, test_user, mock_redis):
        """Test getting usage when user has no subscription (defaults to free)"""
        service = BillingService(db)
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                mock_redis.get.return_value = "0"
                
                result = service.get_current_usage(test_user.id)
                
                assert result["plan_type"] == "free"

    def test_increment_usage_success(self, db, test_user, mock_redis):
        """Test incrementing usage successfully"""
        service = BillingService(db)
        
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                mock_redis.get.return_value = "10"  # Current usage
                mock_redis.incrby.return_value = 11
                
                is_allowed, warning = service.increment_usage(test_user.id, "api_calls", 1)
                
                assert is_allowed is True
                assert warning is None
                assert mock_redis.incrby.called
                assert mock_redis.expire.called

    def test_increment_usage_soft_cap_exceeded(self, db, test_user, mock_redis):
        """Test incrementing usage when soft cap is exceeded"""
        service = BillingService(db)
        
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                # Set current usage to exceed soft cap (500 for free plan)
                mock_redis.get.return_value = "500"
                mock_redis.incrby.return_value = 501
                
                is_allowed, warning = service.increment_usage(test_user.id, "snapshots", 1)
                
                assert is_allowed is True  # Soft cap allows but warns
                assert warning is not None
                assert "Soft cap exceeded" in warning
                assert mock_redis.incrby.called  # Still increments for tracking

    def test_increment_usage_unlimited_plan(self, db, test_user, mock_redis):
        """Test incrementing usage for unlimited plan"""
        service = BillingService(db)
        
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="enterprise",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                mock_redis.incrby.return_value = 1000
                
                is_allowed, warning = service.increment_usage(test_user.id, "api_calls", 1)
                
                assert is_allowed is True
                assert warning is None
                assert mock_redis.incrby.called

    def test_increment_usage_redis_disabled(self, db, test_user):
        """Test incrementing usage when Redis is disabled"""
        service = BillingService(db)
        
        with patch.object(cache_service, 'enabled', False):
            is_allowed, warning = service.increment_usage(test_user.id, "api_calls", 1)
            
            assert is_allowed is True
            assert warning is None

    def test_increment_usage_unknown_metric(self, db, test_user, mock_redis):
        """Test incrementing usage for unknown metric type"""
        service = BillingService(db)
        
        with patch.object(cache_service, 'enabled', True):
            is_allowed, warning = service.increment_usage(test_user.id, "unknown_metric", 1)
            
            assert is_allowed is True
            assert warning is None

    def test_check_soft_cap_exceeded_true(self, db, test_user, mock_redis):
        """Test checking soft cap when exceeded"""
        service = BillingService(db)
        
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                # Set snapshots to exceed soft cap (500 for free)
                mock_redis.get.side_effect = ["0", "0", "0", "501"]
                
                exceeded, message = service.check_soft_cap_exceeded(test_user.id, "snapshots")
                
                assert exceeded is True
                assert message is not None
                assert "Soft cap exceeded" in message

    def test_check_soft_cap_exceeded_false(self, db, test_user, mock_redis):
        """Test checking soft cap when not exceeded"""
        service = BillingService(db)
        
        subscription = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active"
        )
        db.add(subscription)
        db.commit()
        
        with patch.object(cache_service, 'enabled', True):
            with patch.object(cache_service, 'redis_client', mock_redis):
                mock_redis.get.side_effect = ["0", "0", "0", "100"]  # Under limit
                
                exceeded, message = service.check_soft_cap_exceeded(test_user.id, "snapshots")
                
                assert exceeded is False
                assert message is None

    def test_check_soft_cap_exceeded_unknown_metric(self, db, test_user, mock_redis):
        """Test checking soft cap for unknown metric"""
        service = BillingService(db)
        
        with patch.object(cache_service, 'enabled', True):
            exceeded, message = service.check_soft_cap_exceeded(test_user.id, "unknown_metric")
            
            assert exceeded is False
            assert message is None

    @patch('app.services.billing_service.stripe')
    def test_create_stripe_checkout_session_success(self, mock_stripe, db, test_user):
        """Test creating Stripe checkout session successfully"""
        service = BillingService(db)
        service.stripe_available = True
        
        # Mock Stripe session
        mock_session = MagicMock()
        mock_session.id = "cs_test_123"
        mock_session.url = "https://checkout.stripe.com/test"
        mock_stripe.checkout.Session.create.return_value = mock_session
        
        # Mock price ID
        with patch.object(service, '_get_stripe_price_id', return_value="price_test_123"):
            with patch.object(service, '_get_user_email', return_value=test_user.email):
                result = service.create_stripe_checkout_session(
                    test_user.id,
                    "pro",
                    "https://success.com",
                    "https://cancel.com"
                )
                
                assert result is not None
                assert "session_id" in result
                assert "url" in result
                assert result["session_id"] == "cs_test_123"
                assert mock_stripe.checkout.Session.create.called

    def test_create_stripe_checkout_session_stripe_unavailable(self, db, test_user):
        """Test creating checkout session when Stripe is unavailable"""
        service = BillingService(db)
        service.stripe_available = False
        
        result = service.create_stripe_checkout_session(
            test_user.id,
            "pro",
            "https://success.com",
            "https://cancel.com"
        )
        
        assert result is None

    @patch('app.services.billing_service.stripe')
    def test_create_stripe_checkout_session_no_price_id(self, mock_stripe, db, test_user):
        """Test creating checkout session when price ID is missing"""
        service = BillingService(db)
        service.stripe_available = True
        
        with patch.object(service, '_get_stripe_price_id', return_value=None):
            result = service.create_stripe_checkout_session(
                test_user.id,
                "pro",
                "https://success.com",
                "https://cancel.com"
            )
            
            assert result is None

    @patch('app.services.billing_service.stripe')
    def test_handle_stripe_webhook_success(self, mock_stripe, db, test_user):
        """Test handling Stripe webhook successfully"""
        service = BillingService(db)
        service.stripe_available = True
        
        # Mock webhook event
        mock_event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {
                        "user_id": str(test_user.id),
                        "plan_type": "pro"
                    }
                }
            }
        }
        
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        with patch('app.services.billing_service.settings') as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            
            with patch('app.services.billing_service.SubscriptionService') as mock_sub_service:
                mock_instance = MagicMock()
                mock_sub_service.return_value = mock_instance
                
                result = service.handle_stripe_webhook(b'{"test": "data"}', "sig_test")
                
                assert result["status"] == "success"
                assert "Subscription updated" in result["message"]
                assert mock_instance.create_or_update_subscription.called

    @patch('app.services.billing_service.stripe')
    def test_handle_stripe_webhook_invalid_signature(self, mock_stripe, db):
        """Test handling webhook with invalid signature"""
        service = BillingService(db)
        service.stripe_available = True
        
        import stripe.error
        mock_stripe.Webhook.construct_event.side_effect = stripe.error.SignatureVerificationError(
            "Invalid signature", "sig"
        )
        
        with patch('app.services.billing_service.settings') as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            
            result = service.handle_stripe_webhook(b'{"test": "data"}', "invalid_sig")
            
            assert "error" in result
            assert "Invalid signature" in result["error"]

    @patch('app.services.billing_service.stripe')
    def test_handle_stripe_webhook_invalid_payload(self, mock_stripe, db):
        """Test handling webhook with invalid payload"""
        service = BillingService(db)
        service.stripe_available = True
        
        mock_stripe.Webhook.construct_event.side_effect = ValueError("Invalid payload")
        
        with patch('app.services.billing_service.settings') as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            
            result = service.handle_stripe_webhook(b'invalid json', "sig_test")
            
            assert "error" in result
            assert "Invalid payload" in result["error"]

    @patch('app.services.billing_service.stripe')
    def test_handle_stripe_webhook_unhandled_event(self, mock_stripe, db):
        """Test handling unhandled webhook event type"""
        service = BillingService(db)
        service.stripe_available = True
        
        mock_event = {
            "type": "payment_intent.succeeded",
            "data": {}
        }
        
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        with patch('app.services.billing_service.settings') as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            
            result = service.handle_stripe_webhook(b'{"test": "data"}', "sig_test")
            
            assert result["status"] == "ignored"
            assert "not handled" in result["message"]

    def test_handle_stripe_webhook_stripe_unavailable(self, db):
        """Test handling webhook when Stripe is unavailable"""
        service = BillingService(db)
        service.stripe_available = False
        
        result = service.handle_stripe_webhook(b'{"test": "data"}', "sig_test")
        
        assert "error" in result
        assert "Stripe not available" in result["error"]
