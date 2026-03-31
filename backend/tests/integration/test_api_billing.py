"""
Integration tests for Billing API
"""
import pytest
from unittest.mock import patch
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestBillingAPI:
    """Test Billing API endpoints"""

    async def test_get_usage_success(self, async_client, auth_headers):
        """Test getting usage data successfully"""
        response = await async_client.get(
            "/api/v1/billing/usage",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Handle standard response format
        if "data" in data:
            data = data["data"]
        
        assert "daily_usage" in data
        assert "monthly_usage" in data
        assert "judge_calls" in data
        assert "snapshots" in data
        assert "plan_type" in data
        assert "limits" in data
        assert "soft_caps" in data
        assert isinstance(data["daily_usage"], int)
        assert isinstance(data["monthly_usage"], int)

    async def test_get_usage_unauthorized(self, async_client):
        """Test getting usage without authentication"""
        response = await async_client.get(
            "/api/v1/billing/usage"
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_get_limits_success(self, async_client, auth_headers):
        """Test getting plan limits successfully"""
        response = await async_client.get(
            "/api/v1/billing/limits",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        if "data" in data:
            data = data["data"]
        
        assert "plan_type" in data
        assert "limits" in data
        assert "soft_caps" in data
        assert isinstance(data["limits"], dict)
        assert isinstance(data["soft_caps"], dict)

    async def test_get_limits_unauthorized(self, async_client):
        """Test getting limits without authentication"""
        response = await async_client.get(
            "/api/v1/billing/limits"
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @patch(
        "app.services.billing_service.BillingService.create_checkout_session",
        return_value={"session_id": "txn_test_123", "url": "https://checkout.paddle.com/test"},
    )
    async def test_create_checkout_session_success(self, _mock_checkout, async_client, auth_headers):
        """Test creating Paddle checkout session successfully (service mocked)."""
        response = await async_client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_type": "pro",
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel"
            },
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert "session_id" in data or "url" in data

    @patch("app.services.billing_service.BillingService.create_checkout_session", return_value=None)
    async def test_create_checkout_session_paddle_unavailable(self, _mock_checkout, async_client, auth_headers):
        """Test creating checkout session when Paddle checkout cannot be created"""
        response = await async_client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_type": "pro",
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel"
            },
            headers=auth_headers
        )
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        body = response.json()
        assert body["error"]["code"] == "BILLING_CHECKOUT_UNAVAILABLE"

    async def test_create_checkout_session_unauthorized(self, async_client):
        """Test creating checkout session without authentication"""
        response = await async_client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_type": "pro",
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    @patch(
        "app.services.billing_service.BillingService.create_customer_portal_session",
        return_value=({"url": "https://customer-portal.paddle.com/test"}, None),
    )
    async def test_create_customer_portal_success(self, _mock_portal, async_client, auth_headers):
        response = await async_client.post("/api/v1/billing/customer-portal", json={}, headers=auth_headers)
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["url"].startswith("https://")

    @patch(
        "app.services.billing_service.BillingService.create_customer_portal_session",
        return_value=(None, "no_billing_customer"),
    )
    async def test_create_customer_portal_no_customer(self, _mock_portal, async_client, auth_headers):
        response = await async_client.post("/api/v1/billing/customer-portal", json={}, headers=auth_headers)
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["error"]["code"] == "BILLING_PORTAL_NO_CUSTOMER"

    async def test_create_customer_portal_unauthorized(self, async_client):
        response = await async_client.post("/api/v1/billing/customer-portal", json={})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_create_checkout_session_invalid_plan(self, async_client, auth_headers):
        """Self-serve checkout only allows Starter and Pro."""
        response = await async_client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_type": "enterprise",
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel",
            },
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["error"]["code"] == "BILLING_CHECKOUT_INVALID_PLAN"

    async def test_retry_webhook_forbidden_non_superuser(self, async_client, auth_headers):
        response = await async_client.post(
            "/api/v1/billing/webhook/retry/evt_x",
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    async def test_reconcile_forbidden_non_superuser(self, async_client, auth_headers):
        response = await async_client.post(
            "/api/v1/billing/reconcile",
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

<<<<<<< HEAD
    async def test_reconcile_user_forbidden_non_superuser(self, async_client, auth_headers):
        response = await async_client.post(
            "/api/v1/billing/reconcile/users/1",
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    async def test_timeline_user_forbidden_non_superuser(self, async_client, auth_headers):
        response = await async_client.get(
            "/api/v1/billing/timeline/users/1",
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

=======
>>>>>>> origin/main
    @patch(
        "app.services.billing_service.BillingService.handle_paddle_webhook",
        return_value={"status": "success", "message": "ok"},
    )
    async def test_paddle_webhook_success(self, _mock_wh, async_client):
        """Test handling Paddle webhook successfully (service mocked)."""
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_WEBHOOK_SECRET = "whsec_test"
            
            response = await async_client.post(
                "/api/v1/billing/webhook",
                content=b'{"event_type":"transaction.completed"}',
                headers={
                    "paddle-signature": "ts=1;h1=test"
                }
            )
            
            assert response.status_code == status.HTTP_200_OK
            assert response.json()["data"]["status"] == "success"

    @patch(
        "app.services.billing_service.BillingService.handle_paddle_webhook",
        return_value={"error": "Invalid signature"},
    )
    async def test_paddle_webhook_invalid_signature(self, _mock_wh, async_client):
        """Test handling webhook with invalid signature (service mocked)."""
        with patch("app.services.billing_service.settings") as mock_settings:
            mock_settings.PADDLE_WEBHOOK_SECRET = "whsec_test"
            
            response = await async_client.post(
                "/api/v1/billing/webhook",
                content=b'{"test": "data"}',
                headers={
                    "paddle-signature": "invalid_signature"
                }
            )
            
            assert response.status_code == status.HTTP_400_BAD_REQUEST
            data = response.json()
            assert data["error"]["code"] == "BILLING_WEBHOOK_INVALID"
            error_msg = data["error"]["message"]
            assert "signature" in error_msg.lower() or "invalid" in error_msg.lower()

    async def test_paddle_webhook_no_signature(self, async_client):
        """Test handling webhook without signature header"""
        response = await async_client.post(
            "/api/v1/billing/webhook",
            content=b'{"test": "data"}'
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["error"]["code"] == "BILLING_WEBHOOK_INVALID"

    @patch(
        "app.services.billing_service.BillingService.retry_failed_webhook_event",
        return_value={"status": "success", "event_id": "evt_1", "event_type": "transaction.completed"},
    )
    async def test_retry_failed_webhook_success(self, _mock_retry, async_client, superuser_auth_headers):
        response = await async_client.post(
            "/api/v1/billing/webhook/retry/evt_1",
            headers=superuser_auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.json()["data"]["status"] == "success"

    @patch(
        "app.services.billing_service.BillingService.retry_failed_webhook_event",
        return_value={"status": "error", "code": "BILLING_EVENT_NOT_FOUND", "message": "Event not found"},
    )
    async def test_retry_failed_webhook_not_found(self, _mock_retry, async_client, superuser_auth_headers):
        response = await async_client.post(
            "/api/v1/billing/webhook/retry/missing",
            headers=superuser_auth_headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["error"]["code"] == "BILLING_EVENT_NOT_FOUND"

    @patch(
        "app.services.billing_service.BillingService.reconcile_paddle_subscriptions",
        return_value={"status": "success", "checked": 1, "fixed": 1, "failed": 0},
    )
    async def test_reconcile_billing_success(self, _mock_reconcile, async_client, superuser_auth_headers):
        response = await async_client.post(
            "/api/v1/billing/reconcile?limit=50",
            headers=superuser_auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["status"] == "success"
        assert data["fixed"] == 1
<<<<<<< HEAD

    @patch(
        "app.services.billing_service.BillingService.reconcile_paddle_subscription_for_user",
        return_value={
            "status": "success",
            "user_id": 1,
            "before": {"plan_type": "pro", "status": "active"},
            "after": {"plan_type": "pro", "status": "cancelled"},
            "drift_fixed": True,
        },
    )
    async def test_reconcile_single_user_success(self, _mock_reconcile, async_client, superuser_auth_headers):
        response = await async_client.post(
            "/api/v1/billing/reconcile/users/1",
            headers=superuser_auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["status"] == "success"
        assert data["user_id"] == 1
        assert data["drift_fixed"] is True

    @patch(
        "app.services.billing_service.BillingService.get_billing_timeline_for_user",
        return_value=(
            {
                "user": {"id": 1, "email": "test@example.com"},
                "subscription": {"plan_type": "pro", "status": "cancelled"},
                "current_entitlement": {
                    "effective_plan_id": "pro",
                    "entitlement_status": "active_until_period_end",
                },
                "recent_entitlements": [],
                "events": [],
            },
            None,
        ),
    )
    async def test_get_billing_timeline_success(self, _mock_timeline, async_client, superuser_auth_headers):
        response = await async_client.get(
            "/api/v1/billing/timeline/users/1?limit=10",
            headers=superuser_auth_headers,
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()["data"]
        assert data["user"]["id"] == 1
        assert data["subscription"]["plan_type"] == "pro"

    @patch(
        "app.services.billing_service.BillingService.get_billing_timeline_for_user",
        return_value=(None, "user_not_found"),
    )
    async def test_get_billing_timeline_user_not_found(self, _mock_timeline, async_client, superuser_auth_headers):
        response = await async_client.get(
            "/api/v1/billing/timeline/users/999",
            headers=superuser_auth_headers,
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert response.json()["error"]["code"] == "BILLING_TIMELINE_USER_NOT_FOUND"
=======
>>>>>>> origin/main
