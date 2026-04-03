from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from app.models.release_gate_job import ReleaseGateJob


def datetime_delta_ms(start: Optional[datetime], end: Optional[datetime]) -> Optional[int]:
    if start is None or end is None:
        return None
    try:
        return max(0, int((end - start).total_seconds() * 1000))
    except Exception:
        return None


def job_perf_summary(job: ReleaseGateJob) -> Optional[Dict[str, Optional[int]]]:
    perf = {
        "queue_wait_ms": datetime_delta_ms(
            getattr(job, "created_at", None),
            getattr(job, "started_at", None),
        ),
        "execution_wall_ms": datetime_delta_ms(
            getattr(job, "started_at", None),
            getattr(job, "finished_at", None),
        ),
        "total_completion_ms": datetime_delta_ms(
            getattr(job, "created_at", None),
            getattr(job, "finished_at", None),
        ),
    }
    if all(value is None for value in perf.values()):
        return None
    return perf


def merge_result_perf_with_job_summary(
    result_json: Dict[str, Any], job: ReleaseGateJob, finished_at: Optional[datetime] = None
) -> Dict[str, Any]:
    merged = dict(result_json)
    created_at = getattr(job, "created_at", None)
    started_at = getattr(job, "started_at", None)
    effective_finished_at = finished_at or getattr(job, "finished_at", None)
    perf_summary = {
        "queue_wait_ms": datetime_delta_ms(created_at, started_at),
        "execution_wall_ms": datetime_delta_ms(started_at, effective_finished_at),
        "total_completion_ms": datetime_delta_ms(created_at, effective_finished_at),
    }
    if all(value is None for value in perf_summary.values()):
        return merged
    current_perf = merged.get("perf")
    perf_payload = dict(current_perf) if isinstance(current_perf, dict) else {}
    perf_payload.update(perf_summary)
    merged["perf"] = perf_payload
    return merged


def build_job_out_payload(
    job: ReleaseGateJob,
    *,
    iso_fn,
) -> Dict[str, Any]:
    return {
        "id": str(job.id),
        "status": str(job.status),
        "created_at": iso_fn(getattr(job, "created_at", None)),
        "started_at": iso_fn(getattr(job, "started_at", None)),
        "finished_at": iso_fn(getattr(job, "finished_at", None)),
        "cancel_requested_at": iso_fn(getattr(job, "cancel_requested_at", None)),
        "progress": {
            "done": int(getattr(job, "progress_done", 0) or 0),
            "total": (
                int(job.progress_total)
                if getattr(job, "progress_total", None) is not None
                else None
            ),
            "phase": (str(job.progress_phase) if getattr(job, "progress_phase", None) else None),
        },
        "report_id": str(job.report_id) if getattr(job, "report_id", None) else None,
        "error_detail": job.error_detail if isinstance(job.error_detail, dict) else None,
        "perf": job_perf_summary(job),
    }
