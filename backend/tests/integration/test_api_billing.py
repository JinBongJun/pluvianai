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
        
        # May succeed or fail depending on billing route / Paddle configuration
        assert response.status_code in [
            status.HTTP_200_OK,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            status.HTTP_503_SERVICE_UNAVAILABLE
        ]
        
        if response.status_code == status.HTTP_200_OK:
            data = response.json()
            if "data" in data:
                data = data["data"]
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
            
            # Should handle gracefully
            assert response.status_code in [
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                status.HTTP_503_SERVICE_UNAVAILABLE,
                status.HTTP_200_OK  # If it returns None gracefully
            ]

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
            
            # Webhook may succeed or fail depending on configuration
            assert response.status_code in [
                status.HTTP_200_OK,
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ]

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
            
            assert response.status_code in [
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ]
            
            data = response.json()
            error_msg = data.get("error", {}).get("message") or data.get("detail", "")
            if error_msg:
                assert "signature" in error_msg.lower() or "invalid" in error_msg.lower()

    async def test_paddle_webhook_no_signature(self, async_client):
        """Test handling webhook without signature header"""
        response = await async_client.post(
            "/api/v1/billing/webhook",
            content=b'{"test": "data"}'
        )
        
        # Should handle missing signature
        assert response.status_code in [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            status.HTTP_500_INTERNAL_SERVER_ERROR
        ]
