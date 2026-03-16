import pytest
from fastapi import status


@pytest.mark.integration
@pytest.mark.asyncio
class TestRateLimitMiddleware:
    async def test_dashboard_read_bucket_returns_structured_429(
        self, async_client, auth_headers, monkeypatch
    ):
        import app.middleware.rate_limit as rate_limit

        monkeypatch.setattr(
            rate_limit.RateLimitMiddleware,
            "_check_rate_limit",
            lambda self, client_id: True,
        )
        monkeypatch.setattr(rate_limit, "_extract_user_id_from_request", lambda request: "user-123")
        monkeypatch.setattr(
            rate_limit,
            "check_user_rate_limit",
            lambda user_id, limit_per_minute, window_sec=60, bucket_key="default": False,
        )

        response = await async_client.get(
            "/api/v1/projects/1/live-view/agents",
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        data = response.json()
        assert data["error"]["code"] == "RATE_LIMIT_EXCEEDED"
        assert data["error"]["message"] == "Too many requests. Please wait a moment and try again."
        assert data["error"]["details"]["bucket"] == "dashboard_read"
        assert data["error"]["details"]["scope"] == "user"
        assert data["error"]["details"]["limit"] == 300
        assert response.headers["Retry-After"] == "60"
        assert response.headers["X-RateLimit-Bucket"] == "dashboard_read"

