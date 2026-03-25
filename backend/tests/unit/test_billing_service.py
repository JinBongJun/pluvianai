"""
Unit tests for BillingService
"""
import hashlib
import hmac
import json

import pytest
from unittest.mock import patch, MagicMock
from app.services.billing_service import BillingService, verify_paddle_webhook_signature
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

    @staticmethod
    def _paddle_sig(body: bytes, secret: str, ts: str = "1700000000") -> str:
        signed = f"{ts}:{body.decode('utf-8')}"
        digest = hmac.new(secret.encode("utf-8"), signed.encode("utf-8"), hashlib.sha256).hexdigest()
        return f"ts={ts};h1={digest}"

    def test_verify_paddle_webhook_signature_accepts_valid(self):
        secret = "endpoint_secret_test"
        body = b'{"hello":"world"}'
        sig = self._paddle_sig(body, secret)
        assert verify_paddle_webhook_signature(body, sig, secret) is True

    def test_verify_paddle_webhook_signature_rejects_bad_secret(self):
        body = b'{"a":1}'
        sig = self._paddle_sig(body, "good")
        assert verify_paddle_webhook_signature(body, sig, "wrong") is False

    def test_create_checkout_session_success(self, db, test_user):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test_api_key_xxxxxxxx"
            mock_settings.PADDLE_USE_SANDBOX = True
            service = BillingService(db)
            with patch.object(service, "_paddle_post") as mock_post:
                mock_post.return_value = (
                    {
                        "id": "txn_test_123",
                        "checkout": {"url": "https://sandbox-checkout.paddle.com/test"},
                    },
                    None,
                )
                with patch.object(service, "_get_paddle_price_id", return_value="pri_test"):
                    with patch.object(service, "_get_or_create_paddle_customer", return_value="ctm_test"):
                        result = service.create_checkout_session(
                            test_user.id,
                            "pro",
                            "https://success.com",
                            "https://cancel.com",
                        )
        assert result is not None
        assert result["session_id"] == "txn_test_123"
        assert result["url"].startswith("https://")

    def test_create_checkout_session_paddle_unavailable(self, db, test_user):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = ""
            service = BillingService(db)
            result = service.create_checkout_session(
                test_user.id,
                "pro",
                "https://success.com",
                "https://cancel.com",
            )
        assert result is None

    def test_create_checkout_session_no_price_id(self, db, test_user):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test_key"
            service = BillingService(db)
            with patch.object(service, "_get_paddle_price_id", return_value=None):
                result = service.create_checkout_session(
                    test_user.id,
                    "pro",
                    "https://success.com",
                    "https://cancel.com",
                )
        assert result is None

    def test_handle_paddle_webhook_transaction_completed(self, db, test_user):
        secret = "whsec_paddle_test"
        payload_obj = {
            "event_type": "transaction.completed",
            "data": {
                "id": "txn_1",
                "custom_data": {"user_id": str(test_user.id), "plan_type": "pro"},
                "subscription_id": "sub_1",
                "customer_id": "ctm_1",
            },
        }
        raw = json.dumps(payload_obj).encode("utf-8")
        sig = self._paddle_sig(raw, secret)
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = secret
            service = BillingService(db)
            with patch("app.services.subscription_service.SubscriptionService") as mock_sub:
                mock_sub.return_value.create_or_update_subscription = MagicMock()
                result = service.handle_paddle_webhook(raw, sig)
        assert result["status"] == "success"
        assert mock_sub.return_value.create_or_update_subscription.called

    def test_handle_paddle_webhook_missing_custom_data(self, db):
        secret = "whsec_paddle_test"
        payload_obj = {
            "event_type": "transaction.completed",
            "data": {"id": "txn_1", "custom_data": {}},
        }
        raw = json.dumps(payload_obj).encode("utf-8")
        sig = self._paddle_sig(raw, secret)
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = secret
            service = BillingService(db)
            result = service.handle_paddle_webhook(raw, sig)
        assert result.get("status") == "error"
        assert "custom_data" in result.get("message", "").lower()

    def test_handle_paddle_webhook_invalid_signature(self, db):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = "secret"
            service = BillingService(db)
            result = service.handle_paddle_webhook(b"{}", "ts=1;h1=deadbeef")
        assert result.get("error") == "Invalid signature"

    def test_handle_paddle_webhook_invalid_payload(self, db):
        secret = "whsec_paddle_test"
        raw = b"not-json"
        sig = self._paddle_sig(raw, secret)
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = secret
            service = BillingService(db)
            result = service.handle_paddle_webhook(raw, sig)
        assert result.get("error") == "Invalid payload"

    def test_handle_paddle_webhook_unhandled_event(self, db):
        secret = "whsec_paddle_test"
        payload_obj = {"event_type": "transaction.created", "data": {"id": "txn_1"}}
        raw = json.dumps(payload_obj).encode("utf-8")
        sig = self._paddle_sig(raw, secret)
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = secret
            service = BillingService(db)
            result = service.handle_paddle_webhook(raw, sig)
        assert result["status"] == "ignored"
        assert "not handled" in result["message"]

    def test_handle_paddle_webhook_paddle_unavailable(self, db):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = ""
            service = BillingService(db)
            result = service.handle_paddle_webhook(b"{}", "ts=1;h1=x")
        assert "error" in result
        assert "not configured" in result["error"].lower()
