"""
Unit tests for BillingService
"""
import hashlib
import hmac
import json

import pytest
from unittest.mock import patch, MagicMock
from app.services.billing_service import BillingService, verify_paddle_webhook_signature
from app.utils.idempotency import idempotency_service
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
        called_payload = mock_post.call_args.args[1]
        assert called_payload["checkout"]["success_url"] == "https://success.com"
        assert "url" not in called_payload["checkout"]
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

    def test_create_checkout_session_rejects_non_self_serve_plan(self, db, test_user):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test_key"
            service = BillingService(db)
            result = service.create_checkout_session(
                test_user.id,
                "free",
                "https://success.com",
                "https://cancel.com",
            )
        assert result is None

    def test_create_customer_portal_session_success_prefers_cancel_link(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_id="pro",
            status="active",
            paddle_customer_id="ctm_test",
            paddle_subscription_id="sub_deep",
        )
        db.add(sub)
        db.commit()
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test_key"
            service = BillingService(db)
            portal_payload = {
                "urls": {
                    "general": {"overview": "https://portal.example/o"},
                    "subscriptions": [
                        {
                            "id": "sub_deep",
                            "cancel_subscription": "https://portal.example/cancel",
                        }
                    ],
                }
            }
            with patch.object(service, "_paddle_post", return_value=(portal_payload, None)):
                data, err = service.create_customer_portal_session(test_user.id)
        assert err is None
        assert data is not None
        assert data["url"] == "https://portal.example/cancel"

    def test_create_customer_portal_session_falls_back_to_overview(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_id="pro",
            status="active",
            paddle_customer_id="ctm_test",
            paddle_subscription_id=None,
        )
        db.add(sub)
        db.commit()
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test_key"
            service = BillingService(db)
            portal_payload = {"urls": {"general": {"overview": "https://portal.example/o"}}}
            with patch.object(service, "_paddle_post", return_value=(portal_payload, None)):
                data, err = service.create_customer_portal_session(test_user.id)
        assert err is None
        assert data["url"] == "https://portal.example/o"

    def test_create_customer_portal_session_no_customer(self, db, test_user):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test_key"
            service = BillingService(db)
            data, err = service.create_customer_portal_session(test_user.id)
        assert data is None
        assert err == "no_billing_customer"

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

    def test_handle_paddle_webhook_idempotent_duplicate(self, db, test_user):
        secret = "whsec_paddle_test"
        payload_obj = {
            "event_id": "evt_123",
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
                with patch.object(idempotency_service, "get", side_effect=[None, {"status": "success"}]):
                    with patch.object(idempotency_service, "set") as mock_set:
                        first = service.handle_paddle_webhook(raw, sig)
                        second = service.handle_paddle_webhook(raw, sig)

        assert first["status"] == "success"
        assert second["status"] == "duplicate"
        assert mock_sub.return_value.create_or_update_subscription.call_count == 1
        assert mock_set.called

    def test_handle_paddle_webhook_paddle_unavailable(self, db):
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = ""
            service = BillingService(db)
            result = service.handle_paddle_webhook(b"{}", "ts=1;h1=x")
        assert "error" in result
        assert "not configured" in result["error"].lower()

    def test_handle_paddle_webhook_without_event_id_skips_idempotency(self, db):
        secret = "whsec_paddle_test"
        payload_obj = {"event_type": "transaction.created", "data": {"id": "txn_1"}}
        raw = json.dumps(payload_obj).encode("utf-8")
        sig = self._paddle_sig(raw, secret)

        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = secret
            service = BillingService(db)
            with patch.object(idempotency_service, "get") as mock_get:
                with patch.object(idempotency_service, "set") as mock_set:
                    first = service.handle_paddle_webhook(raw, sig)
                    second = service.handle_paddle_webhook(raw, sig)

        assert first["status"] == "ignored"
        assert second["status"] == "ignored"
        assert mock_get.call_count == 0
        assert mock_set.call_count == 0

    def test_handle_paddle_webhook_error_records_dlq(self, db):
        secret = "whsec_paddle_test"
        payload_obj = {
            "event_id": "evt_dlq_1",
            "event_type": "transaction.completed",
            "data": {"id": "txn_1", "custom_data": {}},
        }
        raw = json.dumps(payload_obj).encode("utf-8")
        sig = self._paddle_sig(raw, secret)
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_WEBHOOK_SECRET = secret
            service = BillingService(db)
            with patch.object(cache_service, "enabled", True):
                mock_redis = MagicMock()
                with patch.object(cache_service, "redis_client", mock_redis):
                    result = service.handle_paddle_webhook(raw, sig)
        assert result["status"] == "error"
        assert mock_redis.setex.called

    def test_retry_failed_webhook_event_not_found(self, db):
        service = BillingService(db)
        with patch.object(cache_service, "enabled", True):
            mock_redis = MagicMock()
            mock_redis.get.return_value = None
            with patch.object(cache_service, "redis_client", mock_redis):
                result = service.retry_failed_webhook_event("missing_event")
        assert result["status"] == "error"
        assert result["code"] == "BILLING_EVENT_NOT_FOUND"

    def test_retry_failed_webhook_event_success_deletes_from_dlq(self, db):
        service = BillingService(db)
        doc = {
            "event_id": "evt_retry_1",
            "payload": '{"event_type":"transaction.created","data":{"id":"txn_1"}}',
            "paddle_signature": "ts=1;h1=x",
        }
        with patch.object(cache_service, "enabled", True):
            mock_redis = MagicMock()
            mock_redis.get.return_value = json.dumps(doc)
            with patch.object(cache_service, "redis_client", mock_redis):
                with patch.object(service, "handle_paddle_webhook", return_value={"status": "ignored"}) as mock_handle:
                    result = service.retry_failed_webhook_event("evt_retry_1")
        assert result["status"] == "ignored"
        assert mock_handle.called
        assert mock_redis.delete.called

    def test_reconcile_paddle_subscriptions_fixes_mismatch(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_type="free",
            status="active",
            paddle_subscription_id="sub_123",
            paddle_customer_id="ctm_123",
        )
        db.add(sub)
        db.commit()
        service = BillingService(db)
        service.paddle_available = True
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_PRICE_ID_PRO = "pri_pro"
            mock_settings.PADDLE_PRICE_ID_INDIE = None
            mock_settings.PADDLE_PRICE_ID_STARTUP = None
            mock_settings.PADDLE_PRICE_ID_ENTERPRISE = None
            with patch.object(
                service,
                "_paddle_get",
                return_value=(
                    {
                        "id": "sub_123",
                        "status": "active",
                        "customer_id": "ctm_123",
                        "items": [{"price": {"id": "pri_pro"}}],
                        "current_billing_period": {},
                    },
                    None,
                ),
            ):
                result = service.reconcile_paddle_subscriptions(limit=10)
        assert result["status"] == "success"
        assert result["fixed"] == 1

    def test_change_paddle_subscription_plan_upgrade_uses_prorated_immediately(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_id="starter",
            status="active",
            paddle_subscription_id="sub_test",
            paddle_customer_id="ctm_test",
        )
        db.add(sub)
        db.commit()
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_PRICE_ID_STARTER = "pri_st"
            mock_settings.PADDLE_PRICE_ID_PRO = "pri_pr"
            service = BillingService(db)
            service.paddle_available = True
            with patch.object(
                service,
                "_paddle_get",
                return_value=({"id": "sub_test", "status": "active", "items": []}, None),
            ):
                with patch.object(service, "_paddle_patch") as mock_patch:
                    mock_patch.return_value = (
                        {
                            "id": "sub_test",
                            "status": "active",
                            "customer_id": "ctm_test",
                            "items": [{"price": {"id": "pri_pr"}}],
                            "current_billing_period": {
                                "starts_at": "2026-01-01T00:00:00Z",
                                "ends_at": "2026-02-01T00:00:00Z",
                            },
                        },
                        None,
                    )
                    with patch("app.services.subscription_service.SubscriptionService") as mock_sub:
                        mock_sub.return_value.create_or_update_subscription = MagicMock()
                        result, err = service.change_paddle_subscription_plan(test_user.id, "pro")
        assert err is None
        assert result is not None
        assert result["change_type"] == "upgrade"
        assert result["proration_billing_mode"] == "prorated_immediately"
        payload = mock_patch.call_args[0][1]
        assert payload["proration_billing_mode"] == "prorated_immediately"
        assert payload["items"][0]["price_id"] == "pri_pr"

    def test_change_paddle_subscription_plan_downgrade_uses_full_next_billing_period(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_id="pro",
            status="active",
            paddle_subscription_id="sub_test",
            paddle_customer_id="ctm_test",
        )
        db.add(sub)
        db.commit()
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_PRICE_ID_STARTER = "pri_st"
            mock_settings.PADDLE_PRICE_ID_PRO = "pri_pr"
            service = BillingService(db)
            service.paddle_available = True
            with patch.object(
                service,
                "_paddle_get",
                return_value=({"id": "sub_test", "status": "active", "items": []}, None),
            ):
                with patch.object(service, "_paddle_patch") as mock_patch:
                    mock_patch.return_value = (
                        {
                            "id": "sub_test",
                            "status": "active",
                            "customer_id": "ctm_test",
                            "items": [{"price": {"id": "pri_st"}}],
                            "current_billing_period": {},
                        },
                        None,
                    )
                    with patch("app.services.subscription_service.SubscriptionService") as mock_sub:
                        mock_sub.return_value.create_or_update_subscription = MagicMock()
                        result, err = service.change_paddle_subscription_plan(test_user.id, "starter")
        assert err is None
        assert result["change_type"] == "downgrade"
        assert result["proration_billing_mode"] == "full_next_billing_period"
        payload = mock_patch.call_args[0][1]
        assert payload["proration_billing_mode"] == "full_next_billing_period"

    def test_change_paddle_subscription_plan_free_user_returns_checkout_required(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_id="free",
            status="active",
        )
        db.add(sub)
        db.commit()
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            service = BillingService(db)
            service.paddle_available = True
            result, err = service.change_paddle_subscription_plan(test_user.id, "pro")
        assert result is None
        assert err == "checkout_required"

    def test_preview_paddle_subscription_plan_upgrade_includes_due_now(self, db, test_user):
        sub = Subscription(
            user_id=test_user.id,
            plan_id="starter",
            status="active",
            paddle_subscription_id="sub_test",
            paddle_customer_id="ctm_test",
        )
        db.add(sub)
        db.commit()
        preview_body = {
            "currency_code": "USD",
            "next_billed_at": "2026-02-01T00:00:00Z",
            "current_billing_period": {
                "starts_at": "2026-01-01T00:00:00Z",
                "ends_at": "2026-02-01T00:00:00Z",
            },
            "immediate_transaction": {
                "details": {
                    "totals": {
                        "grand_total": "8000",
                        "currency_code": "USD",
                    }
                }
            },
            "recurring_transaction_details": {
                "totals": {"grand_total": "12900", "currency_code": "USD"}
            },
        }
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_API_KEY = "pdl_test"
            mock_settings.PADDLE_PRICE_ID_STARTER = "pri_st"
            mock_settings.PADDLE_PRICE_ID_PRO = "pri_pr"
            service = BillingService(db)
            service.paddle_available = True
            with patch.object(
                service,
                "_paddle_get",
                return_value=({"id": "sub_test", "status": "active", "items": []}, None),
            ):
                with patch.object(service, "_paddle_patch", return_value=(preview_body, None)):
                    result, err = service.preview_paddle_subscription_plan(test_user.id, "pro")
        assert err is None
        assert result["change_type"] == "upgrade"
        assert result["due_now_display"] == "$80.00"
        assert result["current_plan"] == "starter"
