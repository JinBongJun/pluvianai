import pytest

from app.services import release_gate_job_runner as runner_module
from app.services import replay_service as replay_module


@pytest.mark.unit
def test_replay_service_uses_settings_default_concurrency(monkeypatch):
    monkeypatch.setattr(
        replay_module.settings,
        "RELEASE_GATE_REPLAY_MAX_CONCURRENCY",
        17,
        raising=False,
    )

    service = replay_module.ReplayService()

    assert service.max_concurrency == 17
    assert service.semaphore._value == 17


@pytest.mark.unit
def test_replay_service_clamps_non_positive_concurrency(monkeypatch):
    monkeypatch.setattr(
        replay_module.settings,
        "RELEASE_GATE_REPLAY_MAX_CONCURRENCY",
        0,
        raising=False,
    )

    service = replay_module.ReplayService()

    assert service.max_concurrency == 1
    assert service.semaphore._value == 1


@pytest.mark.unit
def test_release_gate_job_runner_uses_settings_defaults(monkeypatch):
    monkeypatch.setattr(
        runner_module.settings,
        "RELEASE_GATE_JOB_RUNNER_POLL_INTERVAL_MS",
        900,
        raising=False,
    )
    monkeypatch.setattr(
        runner_module.settings,
        "RELEASE_GATE_JOB_RUNNER_LEASE_SECONDS",
        45,
        raising=False,
    )

    runner = runner_module.ReleaseGateJobRunner()

    assert runner.poll_interval_seconds == 0.9
    assert runner.lease_seconds == 45


@pytest.mark.unit
def test_release_gate_job_runner_clamps_small_settings(monkeypatch):
    monkeypatch.setattr(
        runner_module.settings,
        "RELEASE_GATE_JOB_RUNNER_POLL_INTERVAL_MS",
        10,
        raising=False,
    )
    monkeypatch.setattr(
        runner_module.settings,
        "RELEASE_GATE_JOB_RUNNER_LEASE_SECONDS",
        1,
        raising=False,
    )

    runner = runner_module.ReleaseGateJobRunner()

    assert runner.poll_interval_seconds == 0.1
    assert runner.lease_seconds == 5
