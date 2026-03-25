import pytest

from app.services import ops_alerting as ops_module


def _collect_dispatches(service):
    events = []

    def _fake_dispatch(severity, title, summary, payload):
        events.append(
            {
                "severity": severity,
                "title": title,
                "summary": summary,
                "payload": payload,
            }
        )

    service._dispatch = _fake_dispatch  # type: ignore[method-assign]
    return events


@pytest.mark.unit
class TestOpsAlertingService:
    def test_ops1_live_view_degradation_emits_warning_with_metrics(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_LIVE_VIEW_MIN_SAMPLES", 3, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_LIVE_VIEW_5XX_RATE_THRESHOLD", 0.2, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_LIVE_VIEW_P95_MS_THRESHOLD", 10000, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        # 1/3 = 33% 5xx > 20% threshold => degraded.
        service.observe_live_view_agents_request(project_id=42, status_code=200, duration_ms=120)
        service.observe_live_view_agents_request(project_id=42, status_code=500, duration_ms=140)
        service.observe_live_view_agents_request(project_id=42, status_code=200, duration_ms=100)

        assert len(events) == 1
        e = events[0]
        assert e["severity"] == "warning"
        assert "Live View API degradation" in e["title"]
        assert e["payload"]["event_type"] == "live_view_api_degraded"
        assert e["payload"]["project_id"] == 42
        assert e["payload"]["samples"] >= 2

    def test_ops2_release_gate_failure_burst_emits_warning(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_RELEASE_GATE_FAILURE_BURST_COUNT", 3, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        service.observe_release_gate_result(project_id=7, success=False, error_summary="timeout")
        service.observe_release_gate_result(project_id=7, success=False, error_summary="timeout")
        service.observe_release_gate_result(project_id=7, success=False, error_summary="timeout")

        assert len(events) == 1
        e = events[0]
        assert e["severity"] == "warning"
        assert "Release Gate failure burst" in e["title"]
        assert e["payload"]["event_type"] == "release_gate_failure_burst"
        assert e["payload"]["project_id"] == 7
        assert e["payload"]["failures_window_count"] == 3

    def test_ops3_db_error_burst_emits_critical(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_DB_ERROR_BURST_COUNT", 3, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        service.observe_db_error("OperationalError")
        service.observe_db_error("OperationalError")
        service.observe_db_error("OperationalError")

        assert len(events) == 1
        e = events[0]
        assert e["severity"] == "critical"
        assert "Database error burst" in e["title"]
        assert e["payload"]["event_type"] == "db_error_burst"
        assert e["payload"]["count_window"] == 3

    def test_ops4_snapshot_error_ratio_emits_warning(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_SNAPSHOT_ERROR_MIN_SAMPLES", 5, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_SNAPSHOT_5XX_RATIO_THRESHOLD", 0.2, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        # 3/5 = 60% > 20%
        for code in [500, 500, 500, 200, 200]:
            service.observe_snapshot_status(project_id=99, status_code=code)

        assert len(events) == 1
        e = events[0]
        assert e["severity"] == "warning"
        assert "High snapshot error ratio" in e["title"]
        assert e["payload"]["event_type"] == "snapshot_error_ratio_high"
        assert e["payload"]["project_id"] == 99
        assert e["payload"]["samples"] == 5

    def test_ops5_dedup_cooldown_suppresses_repeated_identical_alerts(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        now = {"t": 1_000.0}
        monkeypatch.setattr(ops_module, "time", lambda: now["t"], raising=True)
        monkeypatch.setattr(ops_module.settings, "OPS_RELEASE_GATE_FAILURE_BURST_COUNT", 2, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 120, raising=False)

        # First alert emitted.
        service.observe_release_gate_result(project_id=1, success=False, error_summary="x")
        service.observe_release_gate_result(project_id=1, success=False, error_summary="x")
        assert len(events) == 1

        # Keep failing inside cooldown window: no additional alert.
        now["t"] = 1_030.0
        service.observe_release_gate_result(project_id=1, success=False, error_summary="x")
        service.observe_release_gate_result(project_id=1, success=False, error_summary="x")
        assert len(events) == 1

    def test_ops6_recovery_notification_emitted_once_when_condition_clears(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        now = {"t": 2_000.0}
        monkeypatch.setattr(ops_module, "time", lambda: now["t"], raising=True)
        monkeypatch.setattr(ops_module.settings, "OPS_RELEASE_GATE_WINDOW_SECONDS", 1, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_RELEASE_GATE_FAILURE_BURST_COUNT", 2, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 1, raising=False)

        # Trigger incident.
        service.observe_release_gate_result(project_id=12, success=False, error_summary="boom")
        service.observe_release_gate_result(project_id=12, success=False, error_summary="boom")
        assert len(events) == 1
        assert events[0]["payload"]["event_type"] == "release_gate_failure_burst"

        # Move beyond failure window so failures are pruned; success should emit one recovery.
        now["t"] = 2_005.0
        service.observe_release_gate_result(project_id=12, success=True)
        assert len(events) == 2
        assert events[1]["payload"]["event_type"] == "release_gate_recovered"

        # Additional success events should not spam recovery.
        service.observe_release_gate_result(project_id=12, success=True)
        service.observe_release_gate_result(project_id=12, success=True)
        assert len(events) == 2

    def test_ops_project_api_degradation_emits_warning(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_PROJECT_API_MIN_SAMPLES", 3, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_PROJECT_API_5XX_RATE_THRESHOLD", 0.2, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_PROJECT_API_P95_MS_THRESHOLD", 10000, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        service.observe_project_api_request(77, "release_gate", 500, 120)
        service.observe_project_api_request(77, "release_gate", 200, 130)
        service.observe_project_api_request(77, "release_gate", 500, 140)

        assert len(events) == 1
        e = events[0]
        assert e["payload"]["event_type"] == "project_api_degraded"
        assert e["payload"]["project_id"] == 77
        assert e["payload"]["endpoint_group"] == "release_gate"

    def test_ops_release_gate_fail_ratio_emits_warning(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_RELEASE_GATE_RATIO_MIN_SAMPLES", 4, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_RELEASE_GATE_FAIL_RATIO_THRESHOLD", 0.5, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        service.observe_release_gate_result(project_id=55, success=False, error_summary="x")
        service.observe_release_gate_result(project_id=55, success=False, error_summary="x")
        service.observe_release_gate_result(project_id=55, success=False, error_summary="x")
        service.observe_release_gate_result(project_id=55, success=True, error_summary="ok")

        ratio_alerts = [e for e in events if e["payload"].get("event_type") == "release_gate_fail_ratio_high"]
        assert len(ratio_alerts) == 1
        assert ratio_alerts[0]["payload"]["project_id"] == 55
        assert ratio_alerts[0]["payload"]["samples"] == 4

    def test_ops_provider_error_burst_emits_warning(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_PROVIDER_ERROR_BURST_COUNT", 2, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        service.observe_provider_error(
            project_id=9,
            provider="openai",
            error_code="missing_provider_keys",
            error_summary="no key",
        )
        service.observe_provider_error(
            project_id=9,
            provider="openai",
            error_code="missing_provider_keys",
            error_summary="no key",
        )

        assert len(events) == 1
        e = events[0]
        assert e["payload"]["event_type"] == "provider_error_burst"
        assert e["payload"]["provider"] == "openai"
        assert e["payload"]["error_code"] == "missing_provider_keys"

    def test_ops_meta_alert_frequency_emits_when_same_event_spikes(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_PROVIDER_ERROR_BURST_COUNT", 1, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 0, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_META_WINDOW_SECONDS", 3600, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_META_FREQUENCY_THRESHOLD", 3, raising=False)

        service.observe_provider_error(project_id=1, provider="openai", error_code="rate_limit")
        service.observe_provider_error(project_id=2, provider="openai", error_code="rate_limit")
        service.observe_provider_error(project_id=3, provider="openai", error_code="rate_limit")

        meta_alerts = [e for e in events if e["payload"].get("event_type") == "ops_alert_frequency_high"]
        assert len(meta_alerts) == 1
        assert meta_alerts[0]["payload"]["source_event_type"] == "provider_error_burst"

    def test_ops_release_gate_tool_missing_surge(self, monkeypatch):
        service = ops_module.OpsAlertingService()
        events = _collect_dispatches(service)

        monkeypatch.setattr(ops_module.settings, "OPS_RG_TOOL_MISSING_MIN_SAMPLES", 5, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_RG_TOOL_MISSING_RATIO_THRESHOLD", 0.72, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_RG_TOOL_MISSING_WINDOW_SECONDS", 3600, raising=False)
        monkeypatch.setattr(ops_module.settings, "OPS_ALERT_COOLDOWN_SECONDS", 600, raising=False)

        for _ in range(5):
            service.observe_release_gate_tool_missing_surge(77, evidence_rows=4, missing_rows=4)

        surge = [e for e in events if e["payload"].get("event_type") == "release_gate_tool_missing_surge"]
        assert len(surge) == 1
        assert surge[0]["payload"]["project_id"] == 77
