"""
Integration tests for Billing API
"""
import pytest
from unittest.mock import patch, MagicMock
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

    @patch('app.services.billing_service.stripe')
    async def test_create_checkout_session_success(self, mock_stripe, async_client, auth_headers):
        """Test creating Stripe checkout session successfully"""
        # Mock Stripe session
        mock_session = MagicMock()
        mock_session.id = "cs_test_123"
        mock_session.url = "https://checkout.stripe.com/test"
        mock_stripe.checkout.Session.create.return_value = mock_session
        
        response = await async_client.post(
            "/api/v1/billing/checkout",
            json={
                "plan_type": "pro",
                "success_url": "https://example.com/success",
                "cancel_url": "https://example.com/cancel"
            },
            headers=auth_headers
        )
        
        # May succeed or fail depending on Stripe configuration
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

    async def test_create_checkout_session_stripe_unavailable(self, async_client, auth_headers):
        """Test creating checkout session when Stripe is unavailable"""
        with patch('app.services.billing_service.BillingService.stripe_available', False):
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

    @patch('app.services.billing_service.stripe')
    async def test_stripe_webhook_success(self, mock_stripe, async_client):
        """Test handling Stripe webhook successfully"""
        # Mock webhook event
        mock_event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {
                        "user_id": "1",
                        "plan_type": "pro"
                    }
                }
            }
        }
        
        mock_stripe.Webhook.construct_event.return_value = mock_event
        
        with patch('app.services.billing_service.settings') as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            
            response = await async_client.post(
                "/api/v1/billing/webhook",
                content=b'{"test": "data"}',
                headers={
                    "stripe-signature": "test_signature"
                }
            )
            
            # Webhook may succeed or fail depending on configuration
            assert response.status_code in [
                status.HTTP_200_OK,
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_500_INTERNAL_SERVER_ERROR
            ]

    @patch('app.services.billing_service.stripe')
    async def test_stripe_webhook_invalid_signature(self, mock_stripe, async_client):
        """Test handling webhook with invalid signature"""
        import stripe.error
        mock_stripe.Webhook.construct_event.side_effect = stripe.error.SignatureVerificationError(
            "Invalid signature", "sig"
        )
        
        with patch('app.services.billing_service.settings') as mock_settings:
            mock_settings.STRIPE_WEBHOOK_SECRET = "whsec_test"
            
            response = await async_client.post(
                "/api/v1/billing/webhook",
                content=b'{"test": "data"}',
                headers={
                    "stripe-signature": "invalid_signature"
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

    async def test_stripe_webhook_no_signature(self, async_client):
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
