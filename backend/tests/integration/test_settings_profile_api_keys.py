import pytest
from fastapi import status


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
