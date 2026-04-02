from datetime import datetime, timedelta, timezone

import pytest

from app.api.v1.endpoints import release_gate as rg
from app.models.release_gate_job import ReleaseGateJob


@pytest.mark.unit
def test_job_perf_summary_returns_queue_execution_and_total_ms():
    created_at = datetime.now(timezone.utc) - timedelta(seconds=20)
    started_at = created_at + timedelta(seconds=5)
    finished_at = started_at + timedelta(seconds=9)
    job = ReleaseGateJob(
        created_at=created_at,
        started_at=started_at,
        finished_at=finished_at,
    )

    perf = rg._job_perf_summary(job)

    assert perf == {
        "queue_wait_ms": 5000,
        "execution_wall_ms": 9000,
        "total_completion_ms": 14000,
    }


@pytest.mark.unit
def test_merge_result_perf_with_job_summary_preserves_existing_perf_fields():
    created_at = datetime.now(timezone.utc) - timedelta(seconds=18)
    started_at = created_at + timedelta(seconds=4)
    finished_at = started_at + timedelta(seconds=7)
    job = ReleaseGateJob(
        created_at=created_at,
        started_at=started_at,
    )

    merged = rg._merge_result_perf_with_job_summary(
        {"perf": {"avg_attempt_wall_ms": 3500, "attempts": [{"run_index": 1}]}},
        job,
        finished_at=finished_at,
    )

    assert merged["perf"] == {
        "avg_attempt_wall_ms": 3500,
        "attempts": [{"run_index": 1}],
        "queue_wait_ms": 4000,
        "execution_wall_ms": 7000,
        "total_completion_ms": 11000,
    }
