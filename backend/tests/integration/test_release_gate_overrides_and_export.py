import csv
from io import StringIO

import pytest
from fastapi import status

from app.models.snapshot import Snapshot
from app.models.subscription import Subscription
from app.models.trace import Trace
from app.models.user_api_key import UserApiKey
from app.models.validation_dataset import ValidationDataset


def _extract_error_code(data: dict) -> str | None:
    detail = data.get("detail") if isinstance(data, dict) else None
    if isinstance(detail, dict):
        return detail.get("error_code") or detail.get("code")
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        details = err.get("details")
        if isinstance(details, dict):
            nested = (
                details.get("error_code")
                or details.get("code")
                or (details.get("detail", {}) if isinstance(details.get("detail"), dict) else {}).get(
                    "error_code"
                )
            )
            if nested:
                return str(nested)
        return err.get("code")
    return None


def _extract_missing_provider_keys(data: dict) -> list[str]:
    if not isinstance(data, dict):
        return []
    detail = data.get("detail")
    if isinstance(detail, dict) and isinstance(detail.get("missing_provider_keys"), list):
        return [str(x) for x in detail.get("missing_provider_keys")]
    err = data.get("error")
    if isinstance(err, dict):
        details = err.get("details")
        if isinstance(details, dict) and isinstance(details.get("missing_provider_keys"), list):
            return [str(x) for x in details.get("missing_provider_keys")]
    return []


@pytest.mark.integration
@pytest.mark.asyncio
class TestReleaseGateOverridesAndExport:
    async def test_provider_model_mismatch_returns_422(
        self, async_client, auth_headers, db, test_user, test_project
    ):
        from app.api.v1.endpoints import release_gate as rg

        trace = Trace(id="rg-ovr-trace-provider-mismatch", project_id=test_project.id)
        db.add(trace)
        db.add(
            Snapshot(
                project_id=test_project.id,
                trace_id=trace.id,
                agent_id="agent-A",
                provider="openai",
                model="gpt-4.1-mini",
                payload={},
                user_message="hello",
                response="world",
            )
        )
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        # Keep production disabled so pinned-model guard does not mask this mismatch path.
        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "development", raising=False)
        monkeypatch.setattr(rg.app_settings, "RELEASE_GATE_ALLOW_CUSTOM_MODELS", False, raising=False)
        try:
            response = await async_client.post(
                f"/api/v1/projects/{test_project.id}/release-gate/validate",
                json={
                    "trace_id": trace.id,
                    "model_source": "platform",
                    "replay_provider": "openai",
                    "new_model": "gemini-2.5-flash",
                    "repeat_runs": 1,
                    "max_snapshots": 1,
                },
                headers=auth_headers,
            )
        finally:
            monkeypatch.undo()

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        assert _extract_error_code(response.json()) == "provider_model_mismatch"

    async def test_missing_provider_keys_returns_expected_error(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        from app.api.v1.endpoints import release_gate as rg

        trace = Trace(id="rg-ovr-trace-missing-keys", project_id=test_project.id)
        db.add(trace)
        db.add(
            Snapshot(
                project_id=test_project.id,
                trace_id=trace.id,
                agent_id="agent-A",
                provider="openai",
                model="gpt-4.1-mini",
                payload={},
                user_message="hello",
                response="world",
            )
        )
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()

        monkeypatch.setattr(rg.app_settings, "SELF_HOSTED_MODE", False, raising=False)
        monkeypatch.setattr(rg.app_settings, "ENVIRONMENT", "production", raising=False)
        monkeypatch.setattr(rg.app_settings, "OPENAI_API_KEY", "", raising=False)
        monkeypatch.setattr(rg.UserApiKeyService, "get_user_api_key", lambda *args, **kwargs: None, raising=True)

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "detected",
                "repeat_runs": 1,
                "max_snapshots": 1,
            },
            headers=auth_headers,
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        data = response.json()
        assert _extract_error_code(data) == "missing_provider_keys"
        assert "openai" in _extract_missing_provider_keys(data)

    async def test_replay_overrides_are_sanitized_and_export_is_consistent(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        from app.api.v1.endpoints import release_gate as rg

        trace = Trace(id="rg-ovr-trace-sanitize-export", project_id=test_project.id)
        db.add(trace)
        snapshot = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id="agent-A",
            provider="openai",
            model="gpt-4.1-mini",
            payload={},
            user_message="hello",
            response="world",
        )
        db.add(snapshot)
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()
        db.refresh(snapshot)

        monkeypatch.setattr(rg.app_settings, "SELF_HOSTED_MODE", True, raising=False)
        monkeypatch.setattr(rg.app_settings, "OPENAI_API_KEY", "sk-test-live", raising=False)

        observed = {"overrides": None}

        async def _fake_run_batch_replay(**kwargs):
            observed["overrides"] = kwargs.get("replay_overrides")
            # Simulate successful replay result for exactly one snapshot.
            return [
                {
                    "snapshot_id": snapshot.id,
                    "success": True,
                    "status_code": 200,
                    "latency_ms": 42.0,
                    "replay_provider": "openai",
                    "replay_model": "gpt-4.1-mini",
                    "response_data": {
                        "choices": [
                            {
                                "message": {
                                    "content": "ok",
                                    "tool_calls": [],
                                }
                            }
                        ]
                    },
                }
            ]

        monkeypatch.setattr(rg.replay_service, "run_batch_replay", _fake_run_batch_replay, raising=True)

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "detected",
                "repeat_runs": 1,
                "max_snapshots": 1,
                "replay_overrides": {
                    "messages": [{"role": "user", "content": "must be removed"}],
                    "response": "must be removed",
                    "trace_id": "must-be-removed",
                    "agent_id": "must-be-removed",
                    "temperature": 0.2,
                    "tools": [{"type": "function", "function": {"name": "search"}}],
                },
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_200_OK
        body = response.json()
        assert "report_id" in body
        report_id = str(body["report_id"])

        # OVR security: disallowed keys are stripped before replay call.
        assert isinstance(observed["overrides"], dict)
        assert "messages" not in observed["overrides"]
        assert "response" not in observed["overrides"]
        assert "trace_id" not in observed["overrides"]
        assert "agent_id" not in observed["overrides"]
        assert observed["overrides"].get("temperature") == 0.2
        assert isinstance(observed["overrides"].get("tools"), list)

        # Copy/Export consistency baseline: json and csv exports represent the same report id/status.
        export_json = await async_client.get(
            f"/api/v1/projects/{test_project.id}/behavior/reports/{report_id}/export",
            params={"format": "json"},
            headers=auth_headers,
        )
        assert export_json.status_code == status.HTTP_200_OK
        payload_json = export_json.json()
        assert str(payload_json.get("id")) == report_id
        expected_status = payload_json.get("status")

        export_csv = await async_client.get(
            f"/api/v1/projects/{test_project.id}/behavior/reports/{report_id}/export",
            params={"format": "csv"},
            headers=auth_headers,
        )
        assert export_csv.status_code == status.HTTP_200_OK
        csv_rows = list(csv.DictReader(StringIO(export_csv.text)))
        assert len(csv_rows) >= 1
        assert csv_rows[0]["report_id"] == report_id
        assert csv_rows[0]["status"] == expected_status

    async def test_model_override_and_detected_mode_affect_candidate_metadata(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        from app.api.v1.endpoints import release_gate as rg

        trace = Trace(id="rg-ovr-trace-model-toggle", project_id=test_project.id)
        db.add(trace)
        snapshot = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id="agent-A",
            provider="openai",
            model="gpt-4.1-mini",
            payload={},
            user_message="hello",
            response="world",
        )
        db.add(snapshot)
        db.add(Subscription(user_id=test_user.id, plan_type="free", status="active"))
        db.commit()
        db.refresh(snapshot)

        monkeypatch.setattr(rg.app_settings, "SELF_HOSTED_MODE", True, raising=False)
        monkeypatch.setattr(rg.app_settings, "OPENAI_API_KEY", "sk-openai", raising=False)
        monkeypatch.setattr(rg.app_settings, "GOOGLE_API_KEY", "sk-google", raising=False)

        async def _fake_run_batch_replay(**kwargs):
            replay_model = str(kwargs.get("new_model") or snapshot.model)
            replay_provider = str(kwargs.get("replay_provider") or snapshot.provider)
            return [
                {
                    "snapshot_id": snapshot.id,
                    "success": True,
                    "status_code": 200,
                    "latency_ms": 21.0,
                    "replay_provider": replay_provider,
                    "replay_model": replay_model,
                    "response_data": {"choices": [{"message": {"content": "ok"}}]},
                }
            ]

        monkeypatch.setattr(rg.replay_service, "run_batch_replay", _fake_run_batch_replay, raising=True)

        # 1) Platform override path should reflect selected model/provider.
        override_res = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "platform",
                "replay_provider": "google",
                "new_model": "gemini-2.5-flash",
                "repeat_runs": 1,
                "max_snapshots": 1,
            },
            headers=auth_headers,
        )
        assert override_res.status_code == status.HTTP_200_OK
        override_case = override_res.json()["case_results"][0]
        override_attempt = override_case["attempts"][0]
        assert (override_attempt["candidate_snapshot"] or {}).get("provider") == "google"
        assert (override_attempt["candidate_snapshot"] or {}).get("model") == "gemini-2.5-flash"

        # 2) Detected mode should revert to baseline-detected provider/model metadata.
        detected_res = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "detected",
                "repeat_runs": 1,
                "max_snapshots": 1,
            },
            headers=auth_headers,
        )
        assert detected_res.status_code == status.HTTP_200_OK
        detected_case = detected_res.json()["case_results"][0]
        detected_attempt = detected_case["attempts"][0]
        assert (detected_attempt["candidate_snapshot"] or {}).get("provider") == "openai"
        assert (detected_attempt["candidate_snapshot"] or {}).get("model") == "gpt-4.1-mini"

    async def test_saved_key_provider_mismatch_returns_expected_error(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        trace = Trace(id="rg-ovr-trace-saved-key-mismatch", project_id=test_project.id)
        db.add(trace)
        db.add(
            Snapshot(
                project_id=test_project.id,
                trace_id=trace.id,
                agent_id="agent-A",
                provider="openai",
                model="gpt-4.1-mini",
                payload={},
                user_message="hello",
                response="world",
            )
        )
        db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
        key_row = UserApiKey(
            project_id=test_project.id,
            user_id=test_user.id,
            agent_id="agent-A",
            provider="google",
            encrypted_key="enc-key",
            is_active=True,
        )
        db.add(key_row)
        db.commit()
        db.refresh(key_row)

        # Ensure guard path reaches provider mismatch check and does not fail decrypt first.
        from app.api.v1.endpoints import release_gate as rg

        monkeypatch.setattr(rg.app_settings, "SELF_HOSTED_MODE", False, raising=False)
        monkeypatch.setattr(rg.UserApiKeyService, "decrypt_key", lambda *_args, **_kwargs: "decrypted", raising=True)

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "trace_id": trace.id,
                "model_source": "detected",
                "replay_provider": "openai",
                "replay_user_api_key_id": int(key_row.id),
                "repeat_runs": 1,
                "max_snapshots": 1,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        data = response.json()
        assert _extract_error_code(data) == "replay_user_api_key_provider_mismatch"

    async def test_dataset_ids_spanning_multiple_agents_returns_dataset_agent_mismatch(
        self, async_client, auth_headers, db, test_user, test_project, monkeypatch
    ):
        from app.api.v1.endpoints import release_gate as rg

        trace = Trace(id="rg-ovr-trace-dataset-agent-mismatch", project_id=test_project.id)
        db.add(trace)
        s1 = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id="agent-A",
            provider="openai",
            model="gpt-4.1-mini",
            payload={},
            user_message="a",
            response="a",
        )
        s2 = Snapshot(
            project_id=test_project.id,
            trace_id=trace.id,
            agent_id="agent-B",
            provider="openai",
            model="gpt-4.1-mini",
            payload={},
            user_message="b",
            response="b",
        )
        db.add_all([s1, s2])
        db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
        db.commit()
        db.refresh(s1)
        db.refresh(s2)

        ds1 = ValidationDataset(
            project_id=test_project.id,
            label="DS Agent A",
            agent_id="agent-A",
            trace_ids=[trace.id],
            snapshot_ids=[s1.id],
        )
        ds2 = ValidationDataset(
            project_id=test_project.id,
            label="DS Agent B",
            agent_id="agent-B",
            trace_ids=[trace.id],
            snapshot_ids=[s2.id],
        )
        db.add_all([ds1, ds2])
        db.commit()
        db.refresh(ds1)
        db.refresh(ds2)

        monkeypatch.setattr(rg.app_settings, "SELF_HOSTED_MODE", True, raising=False)
        monkeypatch.setattr(rg.app_settings, "OPENAI_API_KEY", "sk-openai", raising=False)

        response = await async_client.post(
            f"/api/v1/projects/{test_project.id}/release-gate/validate",
            json={
                "model_source": "detected",
                "dataset_ids": [str(ds1.id), str(ds2.id)],
                "repeat_runs": 1,
                "max_snapshots": 2,
            },
            headers=auth_headers,
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
        data = response.json()
        assert _extract_error_code(data) == "dataset_agent_mismatch"
