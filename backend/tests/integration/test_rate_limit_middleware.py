import pytest
from fastapi import status
from starlette.requests import Request


@pytest.mark.integration
@pytest.mark.asyncio
class TestRateLimitMiddleware:
    async def test_release_gate_job_poll_uses_dedicated_bucket(self):
        from app.middleware.rate_limit import classify_rate_limit_bucket

        request = Request(
            {
                "type": "http",
                "method": "GET",
                "path": "/api/v1/projects/1/release-gate/jobs/job-123",
                "headers": [],
                "query_string": b"",
            }
        )

        assert classify_rate_limit_bucket(request) == "release_gate_job_poll"

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
        assert data["error"]["details"]["limit"] == 1200
        assert response.headers["Retry-After"] == "60"
        assert response.headers["X-RateLimit-Bucket"] == "dashboard_read"

