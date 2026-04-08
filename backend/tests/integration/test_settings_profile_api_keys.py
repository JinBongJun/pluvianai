import pytest
from fastapi import status
from app.core.google_reauth import create_google_delete_reauth_token
from app.models.email_verification_token import EmailVerificationToken
from app.models.api_key import APIKey
from app.models.organization import Organization, OrganizationMember
from app.models.project import Project
from app.models.refresh_token import RefreshToken
from app.models.subscription import Subscription
from app.models.user_api_key import UserApiKey


def _extract_data(payload: dict):
    if isinstance(payload, dict) and "data" in payload:
        return payload.get("data")
    return payload


@pytest.mark.integration
@pytest.mark.asyncio
class TestSettingsProfileAndApiKeys:
    async def test_h1_profile_update_persists(
        self, async_client, auth_headers
    ):
        get_before = await async_client.get("/api/v1/settings/profile", headers=auth_headers)
        assert get_before.status_code == status.HTTP_200_OK
        before = _extract_data(get_before.json())
        assert before.get("email")

        patch_res = await async_client.patch(
            "/api/v1/settings/profile",
            json={"full_name": "Round4 Profile Name"},
            headers=auth_headers,
        )
        assert patch_res.status_code == status.HTTP_200_OK

        get_after = await async_client.get("/api/v1/settings/profile", headers=auth_headers)
        assert get_after.status_code == status.HTTP_200_OK
        after = _extract_data(get_after.json())
        assert after.get("full_name") == "Round4 Profile Name"
        assert after.get("primary_auth_provider") == "password"
        assert after.get("password_login_enabled") is True

    async def test_h2_h3_h4_service_api_key_lifecycle(
        self, async_client, auth_headers
    ):
        create_res = await async_client.post(
            "/api/v1/settings/api-keys",
            json={"name": "Local SDK key"},
            headers=auth_headers,
        )
        assert create_res.status_code == status.HTTP_201_CREATED
        created = _extract_data(create_res.json())
        raw_key = created.get("api_key")
        key_id = created.get("id")
        assert isinstance(raw_key, str) and raw_key.startswith("ag_live_")
        assert isinstance(key_id, int)

        list_res = await async_client.get("/api/v1/settings/api-keys", headers=auth_headers)
        assert list_res.status_code == status.HTTP_200_OK
        keys = _extract_data(list_res.json()) or []
        item = next((k for k in keys if k.get("id") == key_id), None)
        assert item is not None
        # One-time reveal check: raw api_key should not be included in list payload.
        assert "api_key" not in item
        assert str(item.get("key_prefix", "")).startswith("ag_live_****")
        assert raw_key not in str(item)

        rename_res = await async_client.patch(
            f"/api/v1/settings/api-keys/{key_id}",
            json={"name": "Renamed SDK key"},
            headers=auth_headers,
        )
        assert rename_res.status_code == status.HTTP_200_OK
        renamed = _extract_data(rename_res.json())
        assert renamed.get("name") == "Renamed SDK key"

        list_after_rename = await async_client.get("/api/v1/settings/api-keys", headers=auth_headers)
        assert list_after_rename.status_code == status.HTTP_200_OK
        keys_after_rename = _extract_data(list_after_rename.json()) or []
        renamed_item = next((k for k in keys_after_rename if k.get("id") == key_id), None)
        assert renamed_item is not None
        assert renamed_item.get("name") == "Renamed SDK key"

        revoke_res = await async_client.delete(f"/api/v1/settings/api-keys/{key_id}", headers=auth_headers)
        assert revoke_res.status_code == status.HTTP_204_NO_CONTENT

        list_after_revoke = await async_client.get("/api/v1/settings/api-keys", headers=auth_headers)
        assert list_after_revoke.status_code == status.HTTP_200_OK
        keys_after_revoke = _extract_data(list_after_revoke.json()) or []
        assert all(k.get("id") != key_id for k in keys_after_revoke)

    async def test_h5_change_password_validation_and_success(
        self, async_client, auth_headers, test_user
    ):
        wrong_current = await async_client.patch(
            "/api/v1/settings/password",
            json={"current_password": "wrong-password", "new_password": "ValidPassword123!"},
            headers=auth_headers,
        )
        assert wrong_current.status_code == status.HTTP_401_UNAUTHORIZED

        weak_new = await async_client.patch(
            "/api/v1/settings/password",
            json={"current_password": "testpassword123", "new_password": "short"},
            headers=auth_headers,
        )
        assert weak_new.status_code == status.HTTP_400_BAD_REQUEST

        change_ok = await async_client.patch(
            "/api/v1/settings/password",
            json={"current_password": "testpassword123", "new_password": "BetterPassword123!"},
            headers=auth_headers,
        )
        assert change_ok.status_code == status.HTTP_200_OK
        body = _extract_data(change_ok.json()) or {}
        assert "successfully" in str(body.get("message", "")).lower()

        login_ok = await async_client.post(
            "/api/v1/auth/login",
            data={"username": test_user.email, "password": "BetterPassword123!"},
        )
        assert login_ok.status_code == status.HTTP_200_OK

    async def test_h6_change_email_request_and_verify(
        self, async_client, auth_headers, test_user, db
    ):
        change_req = await async_client.post(
            "/api/v1/settings/email/change-request",
            json={
                "new_email": "updated-email@example.com",
                "current_password": "testpassword123",
            },
            headers=auth_headers,
        )
        assert change_req.status_code == status.HTTP_200_OK

        token = (
            db.query(EmailVerificationToken)
            .filter(
                EmailVerificationToken.user_id == test_user.id,
                EmailVerificationToken.purpose == "change_email",
            )
            .order_by(EmailVerificationToken.id.desc())
            .first()
        )
        assert token is not None
        assert token.email == "updated-email@example.com"

        verify_res = await async_client.get(f"/api/v1/auth/verify-email?token={token.token}")
        assert verify_res.status_code == status.HTTP_200_OK
        body = _extract_data(verify_res.json()) or verify_res.json()
        assert body.get("email") == "updated-email@example.com"

        profile_res = await async_client.get("/api/v1/settings/profile", headers=auth_headers)
        assert profile_res.status_code == status.HTTP_200_OK
        profile = _extract_data(profile_res.json())
        assert profile.get("email") == "updated-email@example.com"

    async def test_h7_google_only_profile_blocks_password_and_email_change(
        self, async_client, auth_headers, test_user, db
    ):
        test_user.primary_auth_provider = "google"
        test_user.password_login_enabled = False
        test_user.google_login_enabled = True
        test_user.google_id = "google-sub-profile"
        db.add(test_user)
        db.commit()

        profile_res = await async_client.get("/api/v1/settings/profile", headers=auth_headers)
        assert profile_res.status_code == status.HTTP_200_OK
        profile = _extract_data(profile_res.json())
        assert profile.get("primary_auth_provider") == "google"
        assert profile.get("password_login_enabled") is False
        assert profile.get("google_login_enabled") is True

        password_res = await async_client.patch(
            "/api/v1/settings/password",
            json={"current_password": "testpassword123", "new_password": "BetterPassword123!"},
            headers=auth_headers,
        )
        assert password_res.status_code == status.HTTP_400_BAD_REQUEST

        email_res = await async_client.post(
            "/api/v1/settings/email/change-request",
            json={
                "new_email": "blocked@example.com",
                "current_password": "testpassword123",
            },
            headers=auth_headers,
        )
        assert email_res.status_code == status.HTTP_400_BAD_REQUEST

    async def test_h8_delete_account_blocks_active_subscription(
        self, async_client, auth_headers, test_user, db
    ):
        db.add(
            Subscription(
                user_id=test_user.id,
                plan_id="starter",
                status="active",
            )
        )
        db.commit()

        response = await async_client.delete(
            "/api/v1/settings/profile",
            json={"password": "testpassword123", "confirmation_text": "DELETE"},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        detail = response.json().get("error") or response.json().get("detail") or {}
        assert "subscription" in str(detail).lower()

    async def test_h8b_google_only_account_requires_recent_google_reauth_to_delete(
        self, async_client, auth_headers, test_user, db
    ):
        org = Organization(name="Google Solo Org", owner_id=test_user.id, plan_type="free")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=test_user.id, role="owner"))

        project = Project(
            name="Google Solo Project",
            owner_id=test_user.id,
            organization_id=org.id,
            is_active=True,
            is_deleted=False,
            usage_mode="full",
        )
        db.add(project)
        db.flush()

        test_user.primary_auth_provider = "google"
        test_user.password_login_enabled = False
        test_user.google_login_enabled = True
        test_user.google_id = "google-delete-sub"
        db.add(test_user)
        db.commit()

        blocked_response = await async_client.delete(
            "/api/v1/settings/profile",
            json={"password": "", "confirmation_text": "DELETE"},
            headers=auth_headers,
        )

        assert blocked_response.status_code == status.HTTP_400_BAD_REQUEST
        blocked_detail = blocked_response.json().get("error") or blocked_response.json().get("detail") or {}
        assert "google" in str(blocked_detail).lower()

        reauth_token = create_google_delete_reauth_token(test_user.id)
        response = await async_client.delete(
            "/api/v1/settings/profile",
            json={"password": "", "confirmation_text": "DELETE"},
            headers={
                **auth_headers,
                "Cookie": f"google_delete_reauth={reauth_token}",
            },
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        db.refresh(test_user)
        db.refresh(org)
        db.refresh(project)
        assert test_user.is_active is False
        assert org.is_deleted is True
        assert project.is_deleted is True

    async def test_h9_delete_account_blocks_shared_org_owner(
        self, async_client, auth_headers, test_user, db
    ):
        other_user = type(test_user)(
            email="teammate@example.com",
            hashed_password=test_user.hashed_password,
            full_name="Teammate",
            is_active=True,
        )
        db.add(other_user)
        db.commit()
        db.refresh(other_user)

        org = Organization(name="Shared Org", owner_id=test_user.id, plan_type="free")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=test_user.id, role="owner"))
        db.add(OrganizationMember(organization_id=org.id, user_id=other_user.id, role="member"))
        db.commit()

        response = await async_client.delete(
            "/api/v1/settings/profile",
            json={"password": "testpassword123", "confirmation_text": "DELETE"},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_409_CONFLICT
        detail = response.json().get("error") or response.json().get("detail") or {}
        assert "ownership" in str(detail).lower() or "shared organization" in str(detail).lower()

    async def test_h10_delete_account_soft_deletes_personal_workspace_and_revokes_credentials(
        self, async_client, auth_headers, test_user, db
    ):
        org = Organization(name="Solo Org", owner_id=test_user.id, plan_type="free")
        db.add(org)
        db.flush()
        db.add(OrganizationMember(organization_id=org.id, user_id=test_user.id, role="owner"))

        project = Project(
            name="Solo Project",
            owner_id=test_user.id,
            organization_id=org.id,
            is_active=True,
            is_deleted=False,
            usage_mode="full",
        )
        db.add(project)
        db.flush()

        db.add(APIKey(user_id=test_user.id, key_hash="hash-1", name="SDK Key", is_active=True))
        db.add(
            UserApiKey(
                project_id=project.id,
                user_id=test_user.id,
                provider="openai",
                encrypted_key="enc",
                key_hint="sk-...123",
                is_active=True,
            )
        )
        db.add(
            RefreshToken(
                user_id=test_user.id,
                token_hash="refresh-hash-1",
                expires_at=test_user.created_at,
                is_revoked=False,
            )
        )
        db.commit()

        response = await async_client.delete(
            "/api/v1/settings/profile",
            json={"password": "testpassword123", "confirmation_text": "DELETE"},
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        db.refresh(test_user)
        db.refresh(org)
        db.refresh(project)
        assert test_user.is_active is False
        assert org.is_deleted is True
        assert project.is_deleted is True
        assert project.is_active is False
        assert db.query(APIKey).filter(APIKey.user_id == test_user.id, APIKey.is_active.is_(True)).count() == 0
        assert (
            db.query(UserApiKey)
            .filter(UserApiKey.user_id == test_user.id, UserApiKey.is_active.is_(True))
            .count()
            == 0
        )
        assert (
            db.query(RefreshToken)
            .filter(RefreshToken.user_id == test_user.id, RefreshToken.is_revoked.is_(False))
            .count()
            == 0
        )
