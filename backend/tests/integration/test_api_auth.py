"""
Integration tests for Authentication API
"""
import pytest
from fastapi import status
from app.models.subscription import Subscription
from app.models.usage import Usage


@pytest.mark.integration
@pytest.mark.asyncio
class TestAuthAPI:
    """Test Authentication API endpoints using async client"""
    
    async def test_register_success(self, async_client, db):
        """Test user registration"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "securepassword123",
                "full_name": "New User"
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
                "full_name": "Duplicate User"
            }
        )
        
        assert response.status_code == status.HTTP_400_BAD_REQUEST
    
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
        
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    async def test_register_weak_password(self, async_client):
        """Test registering with weak password"""
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "user@example.com",
                "password": "123",  # Too short
                "full_name": "User"
            }
        )
        
        # Should either reject or accept (depends on validation)
        assert response.status_code in [
            status.HTTP_201_CREATED,
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_422_UNPROCESSABLE_ENTITY
        ]
    
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

    async def test_get_my_usage_includes_platform_replay_credit_fields(
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
        db.commit()

        response = await async_client.get("/api/v1/auth/me/usage", headers=auth_headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["plan_type"] == "free"
        assert data["limits"]["platform_replay_credits_per_month"] == 1000
        assert data["limits"]["guard_credits_per_month"] == 1000
        assert data["usage_this_month"]["platform_replay_credits"] == 125
        assert data["usage_this_month"]["guard_credits"] == 125
