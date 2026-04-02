import asyncio
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import release_gate as rg


class _DummySessionContext:
    def __enter__(self):
        return object()

    def __exit__(self, exc_type, exc, tb):
        return False


@pytest.mark.unit
def test_resolve_release_gate_parallel_repeat_limit_respects_flag_and_bounds(monkeypatch):
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_ENABLE_PARALLEL_REPEATS",
        False,
        raising=False,
    )
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_MAX_PARALLEL_REPEATS",
        8,
        raising=False,
    )

    assert rg._resolve_release_gate_parallel_repeat_limit(5) == 1

    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_ENABLE_PARALLEL_REPEATS",
        True,
        raising=False,
    )
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_MAX_PARALLEL_REPEATS",
        0,
        raising=False,
    )
    assert rg._resolve_release_gate_parallel_repeat_limit(5) == 1

    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_MAX_PARALLEL_REPEATS",
        3,
        raising=False,
    )
    assert rg._resolve_release_gate_parallel_repeat_limit(5) == 3
    assert rg._resolve_release_gate_parallel_repeat_limit(2) == 2


@pytest.mark.unit
@pytest.mark.asyncio
async def test_execute_release_gate_replay_batches_parallelizes_with_ordered_results(monkeypatch):
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_ENABLE_PARALLEL_REPEATS",
        True,
        raising=False,
    )
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_MAX_PARALLEL_REPEATS",
        2,
        raising=False,
    )
    monkeypatch.setattr(rg, "SessionLocal", lambda: _DummySessionContext(), raising=False)

    started = 0
    active = 0
    max_active = 0
    progress_updates = []

    async def _fake_run_batch_replay(**kwargs):
        nonlocal started, active, max_active
        started += 1
        call_number = started
        active += 1
        max_active = max(max_active, active)
        try:
            await asyncio.sleep(0.03 if call_number == 1 else 0.01)
            return [
                {
                    "snapshot_id": 1,
                    "success": True,
                    "latency_ms": float(call_number * 10),
                }
            ]
        finally:
            active -= 1

    monkeypatch.setattr(rg.replay_service, "run_batch_replay", _fake_run_batch_replay, raising=True)

    batches = await rg._execute_release_gate_replay_batches(
        project_id=1,
        payload=rg.ReleaseGateValidateRequest(repeat_runs=3),
        snapshots=[SimpleNamespace(id=1)],
        db=object(),
        tool_context_payload=None,
        replay_user_api_key_override=None,
        use_platform_model=False,
        progress_hook=lambda done, total, phase, meta: progress_updates.append(
            (done, total, phase, meta.get("run_index"))
        ),
    )

    assert [batch.run_index for batch in batches] == [1, 2, 3]
    assert max_active == 2
    assert [done for done, _, _, _ in progress_updates] == [1, 2, 3]
    assert sorted(run_index for _, _, _, run_index in progress_updates) == [1, 2, 3]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_execute_release_gate_replay_batches_skips_queued_runs_after_cancel(monkeypatch):
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_ENABLE_PARALLEL_REPEATS",
        True,
        raising=False,
    )
    monkeypatch.setattr(
        rg.app_settings,
        "RELEASE_GATE_MAX_PARALLEL_REPEATS",
        2,
        raising=False,
    )
    monkeypatch.setattr(rg, "SessionLocal", lambda: _DummySessionContext(), raising=False)

    cancel_state = {"value": False}
    started = 0
    first_two_started = asyncio.Event()
    release_first_two = asyncio.Event()

    async def _fake_run_batch_replay(**kwargs):
        nonlocal started
        started += 1
        if started == 2:
            first_two_started.set()
        await release_first_two.wait()
        return [{"snapshot_id": 1, "success": True, "latency_ms": 10.0}]

    monkeypatch.setattr(rg.replay_service, "run_batch_replay", _fake_run_batch_replay, raising=True)

    task = asyncio.create_task(
        rg._execute_release_gate_replay_batches(
            project_id=1,
            payload=rg.ReleaseGateValidateRequest(repeat_runs=4),
            snapshots=[SimpleNamespace(id=1)],
            db=object(),
            tool_context_payload=None,
            replay_user_api_key_override=None,
            use_platform_model=False,
            cancel_check=lambda: cancel_state["value"],
        )
    )

    await first_two_started.wait()
    cancel_state["value"] = True
    release_first_two.set()

    with pytest.raises(rg.ReleaseGateCancelled):
        await task

    assert started == 2
