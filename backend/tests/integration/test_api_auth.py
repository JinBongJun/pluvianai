"""
Integration tests for Authentication API
"""
import json
from datetime import datetime
import pytest
from fastapi import status
from app.models.subscription import Subscription
from app.models.usage import Usage


@pytest.mark.integration
@pytest.mark.asyncio
class TestAuthAPI:
    """Test Authentication API endpoints using async client"""

    @staticmethod
    def _extract_error(data: dict) -> dict:
        return data.get("error") or {}
    
    async def test_register_success(self, async_client, db):
        """Test user registration"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "securepassword123",
                "full_name": "New User",
                "liability_agreement_accepted": True,
            }
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert "email" in data
        assert data["email"] == "newuser@example.com"
        assert "password" not in data  # Password should not be in response
    
    async def test_register_duplicate_email(self, async_client, test_user):
        """Test registering with duplicate email"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": test_user.email,
                "password": "password123",
                "full_name": "Duplicate User",
                "liability_agreement_accepted": True,
            }
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.json()["error"]["message"] == "Email already registered"
    
    async def test_register_invalid_email(self, async_client):
        """Test registering with invalid email"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "not-an-email",
                "password": "password123",
                "full_name": "Invalid User"
            }
        )
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    
    async def test_register_weak_password(self, async_client):
        """Test registering with weak password"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "user@example.com",
                "password": "password",
                "full_name": "User",
                "liability_agreement_accepted": True,
            }
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert data["error"]["message"] == "Password policy violation"
        assert "Password is too common." in data["error"]["details"]["reasons"]

    async def test_login_internal_error_returns_generic_500(self, async_client, test_user, monkeypatch):
        """Unexpected login errors should not leak internal exception details."""
        import app.api.v1.endpoints.auth as auth_endpoint

        def _boom(*args, **kwargs):
            raise RuntimeError("sensitive internal failure text")

        monkeypatch.setattr(auth_endpoint, "verify_password", _boom)

        response = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": test_user.email,
                "password": "testpassword123"
            }
        )

        assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        data = response.json()
        assert data["error"]["message"] == "Internal server error"
        assert "sensitive internal failure text" not in json.dumps(data)
    
    async def test_login_success(self, async_client, test_user):
        """Test user login"""
        response = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": test_user.email,
                "password": "testpassword123"
            }
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
    
    async def test_login_invalid_credentials(self, async_client, test_user):
        """Test login with invalid credentials"""
        response = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": test_user.email,
                "password": "wrongpassword"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        error = self._extract_error(response.json())
        assert error["code"] == "invalid_credentials"
        assert error["message"] == "Email or password is incorrect."
    
    async def test_login_nonexistent_user(self, async_client):
        """Test login with non-existent user"""
        response = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": "nonexistent@example.com",
                "password": "password123"
            }
        )
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        error = self._extract_error(response.json())
        assert error["code"] == "invalid_credentials"
        assert error["message"] == "Email or password is incorrect."
    
    async def test_get_current_user(self, async_client, auth_headers, test_user):
        """Test getting current user info"""
        response = await async_client.get(
            "/api/v1/auth/me",
            headers=auth_headers
        )
        
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email
        assert data["id"] == test_user.id
    
    async def test_get_current_user_without_auth(self, async_client):
        """Test getting current user without authentication"""
        response = await async_client.get("/api/v1/auth/me")
        
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        error = self._extract_error(response.json())
        assert error["code"] == "no_token"
        assert error["message"] == "You need to sign in to access this page."

    async def test_refresh_with_invalid_token_returns_structured_401(self, async_client):
        response = await async_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "definitely-not-a-valid-token"},
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED
        error = self._extract_error(response.json())
        assert error["code"] == "refresh_token_invalid"
        assert error["message"] == "Your login session is no longer valid. Please sign in again."

    async def test_get_my_usage_includes_release_gate_attempt_fields(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="guard_credits_replay",
                quantity=125,
                unit="credits",
            )
        )
        db.add(
            Usage(
                user_id=test_user.id,
                project_id=test_project.id,
                metric_name="release_gate_attempts",
                quantity=17,
                unit="count",
            )
        )
        db.commit()

        response = await async_client.get("/api/v1/auth/me/usage", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["plan_type"] == "free"
        assert data["display_plan_type"] == "free"
        assert data["subscription_status"] == "active"
        assert data["entitlement_status"] == "active"
        assert data["entitlement_effective_from"] is not None
        assert data["limits"]["release_gate_attempts_per_month"] == 60
        assert data["limits"]["platform_replay_credits_per_month"] == 60
        assert data["limits"]["guard_credits_per_month"] == 10000
        assert data["usage_this_month"]["release_gate_attempts"] == 17
        assert data["usage_this_month"]["platform_replay_credits"] == 125
        assert data["usage_this_month"]["guard_credits"] == 125
        assert "organizations_used" in data["usage_this_month"]
        assert isinstance(data["usage_this_month"]["organizations_used"], int)

    async def test_get_my_usage_returns_active_until_period_end_for_cancelled_paid_subscription(
        self, async_client, auth_headers, db, test_user
    ):
        db.add(
            Subscription(
                user_id=test_user.id,
                plan_type="pro",
                status="cancelled",
                current_period_start=datetime.fromisoformat("2026-03-01T00:00:00+00:00"),
                current_period_end=datetime.fromisoformat("2099-04-01T00:00:00+00:00"),
            )
        )
        db.commit()

        response = await async_client.get("/api/v1/auth/me/usage", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["plan_type"] == "pro"
        assert data["display_plan_type"] == "pro"
        assert data["subscription_status"] == "cancelled"
        assert data["entitlement_status"] == "active_until_period_end"
        assert data["current_period_end"] is not None
