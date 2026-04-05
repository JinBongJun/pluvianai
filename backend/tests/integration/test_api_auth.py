"""
Integration tests for Authentication API
"""
import json
from datetime import datetime
from urllib.parse import parse_qs, urlparse
import pytest
from fastapi import status
from app.models.email_verification_token import EmailVerificationToken
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.subscription import Subscription
from app.models.usage import Usage
from app.models.user import User
from app.core.security import get_password_hash


@pytest.mark.integration
@pytest.mark.asyncio
class TestAuthAPI:
    """Test Authentication API endpoints using async client"""

    @staticmethod
    def _extract_error(data: dict) -> dict:
        return data.get("error") or {}

    @staticmethod
    def _mock_google_settings(monkeypatch):
        import app.api.v1.endpoints.auth as auth_endpoint

        monkeypatch.setattr(auth_endpoint.settings, "GOOGLE_OAUTH_CLIENT_ID", "google-client-id")
        monkeypatch.setattr(auth_endpoint.settings, "GOOGLE_OAUTH_CLIENT_SECRET", "google-client-secret")
        monkeypatch.setattr(auth_endpoint.settings, "API_BASE_URL", "http://test")
        monkeypatch.setattr(auth_endpoint.settings, "APP_BASE_URL", "http://frontend.test")

    @staticmethod
    def _extract_oauth_state(start_response) -> tuple[str, str]:
        redirect_url = start_response.headers["location"]
        parsed = urlparse(redirect_url)
        state = parse_qs(parsed.query)["state"][0]
        set_cookie = start_response.headers.get("set-cookie", "")
        cookie_value = set_cookie.split("oauth_google_state=", 1)[1].split(";", 1)[0]
        return state, cookie_value
    
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
        assert data["is_email_verified"] is False
        assert "password" not in data  # Password should not be in response
        token = db.query(EmailVerificationToken).filter(EmailVerificationToken.email == "newuser@example.com").first()
        assert token is not None
        set_cookie = response.headers.get_list("set-cookie")
        assert not any("access_token=" in cookie for cookie in set_cookie)
        assert not any("refresh_token=" in cookie for cookie in set_cookie)

        workspace_response = await async_client.get("/api/v1/auth/me/default-workspace")
        assert workspace_response.status_code == status.HTTP_401_UNAUTHORIZED

    async def test_register_does_not_bootstrap_default_workspace_before_verification(self, async_client, db):
        response = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "bootstrap-register@example.com",
                "password": "securepassword123",
                "full_name": "Bootstrap Register User",
                "liability_agreement_accepted": True,
            },
        )

        assert response.status_code == status.HTTP_201_CREATED
        user_id = int(response.json()["id"])

        org = (
            db.query(Organization)
            .filter(Organization.owner_id == user_id, Organization.is_deleted.is_(False))
            .first()
        )
        assert org is None
    
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

    async def test_login_rejects_unverified_email(self, async_client):
        register = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "verifyme@example.com",
                "password": "SecurePassword123!",
                "full_name": "Verify Me",
                "liability_agreement_accepted": True,
            },
        )
        assert register.status_code == status.HTTP_201_CREATED

        response = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": "verifyme@example.com",
                "password": "SecurePassword123!",
            },
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        error = self._extract_error(response.json())
        assert error["code"] == "email_not_verified"

    async def test_login_google_only_account_requires_google_sign_in(self, async_client, db):
        user = User(
            email="google-only@example.com",
            hashed_password="not-used",
            full_name="Google User",
            is_active=True,
            is_email_verified=True,
            primary_auth_provider="google",
            password_login_enabled=False,
            google_login_enabled=True,
            google_id="google-sub-1",
        )
        db.add(user)
        db.commit()

        response = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": "google-only@example.com",
                "password": "whatever",
            },
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        error = self._extract_error(response.json())
        assert error["code"] == "google_sign_in_required"

    async def test_google_oauth_callback_creates_new_user(self, async_client, db, monkeypatch):
        import app.api.v1.endpoints.auth as auth_endpoint
        from app.services.google_oauth_service import GoogleIdentity

        self._mock_google_settings(monkeypatch)

        async def _fake_identity(self, code: str):
            return GoogleIdentity(
                email="new-google@example.com",
                email_verified=True,
                google_id="google-sub-new",
                full_name="New Google User",
                avatar_url="https://example.com/avatar.png",
            )

        monkeypatch.setattr(auth_endpoint.GoogleOAuthService, "get_identity_from_code", _fake_identity)

        start_res = await async_client.get(
            "/api/v1/auth/oauth/google/start?intent=signup&terms_accepted=true",
        )
        assert start_res.status_code == status.HTTP_302_FOUND
        state, cookie_state = self._extract_oauth_state(start_res)

        callback_res = await async_client.get(
            f"/api/v1/auth/oauth/google/callback?code=test-code&state={state}",
            headers={"Cookie": f"oauth_google_state={cookie_state}"},
        )
        assert callback_res.status_code == status.HTTP_302_FOUND

        user = db.query(User).filter(User.email == "new-google@example.com").first()
        assert user is not None
        assert user.google_id == "google-sub-new"
        assert user.google_login_enabled is True
        assert user.password_login_enabled is False
        assert user.is_email_verified is True

        org = (
            db.query(Organization)
            .filter(Organization.owner_id == user.id, Organization.is_deleted.is_(False))
            .first()
        )
        assert org is not None
        project = (
            db.query(Project)
            .filter(
                Project.owner_id == user.id,
                Project.organization_id == org.id,
                Project.is_active.is_(True),
                Project.is_deleted.is_(False),
            )
            .first()
        )
        assert project is not None
        assert (
            callback_res.headers["location"]
            == f"http://frontend.test/organizations/{org.id}/projects/{project.id}/live-view"
        )

    async def test_google_oauth_callback_merges_existing_password_user(
        self, async_client, db, test_user, monkeypatch
    ):
        import app.api.v1.endpoints.auth as auth_endpoint
        from app.services.google_oauth_service import GoogleIdentity

        self._mock_google_settings(monkeypatch)

        test_user.is_email_verified = False
        db.add(test_user)
        db.commit()

        async def _fake_identity(self, code: str):
            return GoogleIdentity(
                email=test_user.email,
                email_verified=True,
                google_id="google-sub-merge",
                full_name="Merged User",
                avatar_url="https://example.com/avatar2.png",
            )

        monkeypatch.setattr(auth_endpoint.GoogleOAuthService, "get_identity_from_code", _fake_identity)

        start_res = await async_client.get("/api/v1/auth/oauth/google/start?intent=login")
        assert start_res.status_code == status.HTTP_302_FOUND
        state, cookie_state = self._extract_oauth_state(start_res)

        callback_res = await async_client.get(
            f"/api/v1/auth/oauth/google/callback?code=test-code&state={state}",
            headers={"Cookie": f"oauth_google_state={cookie_state}"},
        )
        assert callback_res.status_code == status.HTTP_302_FOUND

        user = db.query(User).filter(User.id == test_user.id).first()
        assert user is not None
        assert user.email == test_user.email
        assert user.google_id == "google-sub-merge"
        assert user.google_login_enabled is True
        assert user.password_login_enabled is True
        assert user.is_email_verified is True

    async def test_verify_email_allows_login_after_confirmation(self, async_client, db):
        register = await async_client.post(
            "/api/v1/auth/register",
            json={
                "email": "verifyafter@example.com",
                "password": "SecurePassword123!",
                "full_name": "Verify After",
                "liability_agreement_accepted": True,
            },
        )
        assert register.status_code == status.HTTP_201_CREATED

        token = (
            db.query(EmailVerificationToken)
            .filter(EmailVerificationToken.email == "verifyafter@example.com")
            .order_by(EmailVerificationToken.id.desc())
            .first()
        )
        assert token is not None

        verify_res = await async_client.get(f"/api/v1/auth/verify-email?token={token.token}")
        assert verify_res.status_code == status.HTTP_200_OK
        assert verify_res.json()["verified"] is True
        set_cookie = verify_res.headers.get_list("set-cookie")
        assert any("access_token=" in cookie for cookie in set_cookie)
        assert any("refresh_token=" in cookie for cookie in set_cookie)

        workspace_res = await async_client.get("/api/v1/auth/me/default-workspace")
        assert workspace_res.status_code == status.HTTP_200_OK
        workspace = workspace_res.json()
        assert workspace["organization_id"] is not None
        assert workspace["project_id"] is not None
        assert workspace["path"].endswith(
            f"/projects/{workspace['project_id']}/live-view"
        )

        login_res = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": "verifyafter@example.com",
                "password": "SecurePassword123!",
            },
        )
        assert login_res.status_code == status.HTTP_200_OK

    async def test_get_default_workspace_returns_org_project_path(self, async_client, db):
        user = User(
            email="default-workspace@example.com",
            hashed_password=get_password_hash("testpassword123"),
            full_name="Default Workspace User",
            is_active=True,
            is_email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        org = Organization(
            name="Default Workspace Org",
            owner_id=user.id,
            plan_type="free",
        )
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role="owner"))
        db.add(
            Project(
                name="Default Workspace Project",
                owner_id=user.id,
                organization_id=org.id,
                is_active=True,
                is_deleted=False,
                usage_mode="full",
            )
        )
        db.commit()

        login_res = await async_client.post(
            "/api/v1/auth/login",
            data={
                "username": user.email,
                "password": "testpassword123",
            },
        )
        assert login_res.status_code == status.HTTP_200_OK

        target_res = await async_client.get("/api/v1/auth/me/default-workspace")
        assert target_res.status_code == status.HTTP_200_OK
        payload = target_res.json()
        assert payload["organization_id"] == org.id
        assert payload["project_id"] is not None
        assert payload["path"] == f"/organizations/{org.id}/projects/{payload['project_id']}/live-view"
    
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
                metric_name="snapshots",
                quantity=23,
                unit="count",
            )
        )
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
        assert data["usage_window_type"] == "anniversary_monthly"
        assert data["current_period_start"] is not None
        assert data["current_period_end"] is not None
        assert data["next_reset_at"] is not None
        assert data["entitlement_effective_from"] is not None
        assert data["limits"]["release_gate_attempts_per_month"] == 60
        assert data["limits"]["platform_replay_credits_per_month"] == 60
        assert data["limits"]["guard_credits_per_month"] == 10000
        assert data["usage_this_month"]["snapshots"] == 23
        assert data["usage_current_period"]["snapshots"] == 23
        assert data["usage_this_month"]["release_gate_attempts"] == 17
        assert data["usage_current_period"]["release_gate_attempts"] == 17
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
