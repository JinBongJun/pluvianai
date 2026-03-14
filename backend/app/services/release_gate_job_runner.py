"""
Release Gate async job runner.

Production pattern:
- HTTP request enqueues a row in release_gate_jobs (queued)
- Background runner claims one queued job at a time, runs Release Gate validation,
  then persists the full result payload for UI to fetch via polling.
"""

from __future__ import annotations

import asyncio
import os
import socket
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import or_, and_

from app.core.database import SessionLocal
from app.core.logging_config import logger
from app.models.release_gate_job import ReleaseGateJob
from app.models.user import User
from app.services.ops_alerting import ops_alerting


def _utcnow() -> datetime:
    return datetime.utcnow()


class ReleaseGateJobRunner:
    def __init__(self, poll_interval_seconds: float = 0.5, lease_seconds: int = 90):
        self.poll_interval_seconds = poll_interval_seconds
        self.lease_seconds = lease_seconds
        self.running = False
        self.instance_id = f"{socket.gethostname()}:{os.getpid()}"

    async def start(self):
        self.running = True
        logger.info("Release Gate job runner started")
        while self.running:
            job_id = None
            try:
                job_id = self._claim_next_job()
                if not job_id:
                    await asyncio.sleep(self.poll_interval_seconds)
                    continue
                await self._run_job(job_id)
            except Exception as e:
                logger.error(f"Release Gate job runner error (job_id={job_id}): {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval_seconds)

    async def stop(self):
        self.running = False
        logger.info("Release Gate job runner stopping")

    def _claim_next_job(self) -> Optional[str]:
        db: Session = SessionLocal()
        try:
            now = _utcnow()
            # Claim a queued job. Use SKIP LOCKED when available (Postgres).
            q = (
                db.query(ReleaseGateJob)
                .filter(
                    or_(
                        ReleaseGateJob.status == "queued",
                        and_(
                            ReleaseGateJob.status == "running",
                            ReleaseGateJob.lease_expires_at.isnot(None),
                            ReleaseGateJob.lease_expires_at < now,
                        ),
                    )
                )
                .order_by(ReleaseGateJob.created_at.asc())
            )
            try:
                q = q.with_for_update(skip_locked=True)
            except Exception:
                # Some dialects don't support SKIP LOCKED; still safe with single runner.
                pass
            job = q.first()
            if not job:
                return None

            job.status = "running"
            job.started_at = job.started_at or now
            job.locked_at = now
            job.locked_by = self.instance_id
            job.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
            db.add(job)
            db.commit()
            return str(job.id)
        except SQLAlchemyError as e:
            # Most common during rollout: migrations not applied yet.
            db.rollback()
            logger.warning(f"Release Gate job runner DB error while claiming: {e}")
            return None
        finally:
            db.close()

    async def _run_job(self, job_id: str) -> None:
        # Late import to avoid circular imports on startup.
        from app.api.v1.endpoints.release_gate import (
            ReleaseGateValidateRequest,
            _run_release_gate,
            ReleaseGateCancelled,
        )

        db: Session = SessionLocal()
        try:
            job = (
                db.query(ReleaseGateJob)
                .filter(ReleaseGateJob.id == job_id)
                .first()
            )
            if not job:
                return
            if str(job.status) == "canceled":
                return
            user = db.query(User).filter(User.id == job.user_id).first()
            if not user:
                raise RuntimeError("Release Gate job user not found")

            payload = ReleaseGateValidateRequest(**(job.request_json or {}))

            def cancel_check() -> bool:
                s: Session = SessionLocal()
                try:
                    row = (
                        s.query(ReleaseGateJob.status, ReleaseGateJob.cancel_requested_at)
                        .filter(ReleaseGateJob.id == job_id)
                        .first()
                    )
                    if not row:
                        return False
                    status_val, cancel_requested_at = row
                    if cancel_requested_at is not None:
                        return True
                    return str(status_val or "").lower() == "canceled"
                finally:
                    s.close()

            def progress_hook(
                done: int,
                total: Optional[int],
                phase: Optional[str],
                meta: Optional[dict],
            ) -> None:
                s: Session = SessionLocal()
                try:
                    j = s.query(ReleaseGateJob).filter(ReleaseGateJob.id == job_id).first()
                    if not j:
                        return
                    if str(j.status).lower() == "canceled":
                        return
                    now2 = _utcnow()
                    j.progress_done = int(done or 0)
                    if total is not None:
                        j.progress_total = int(total)
                    if phase:
                        # Keep it compact for UI, but still informative for ops/debugging.
                        suffix = ""
                        if isinstance(meta, dict):
                            run_index = meta.get("run_index")
                            wall_ms = meta.get("batch_wall_ms")
                            if run_index:
                                suffix += f" #{int(run_index)}"
                            if wall_ms is not None:
                                try:
                                    suffix += f" ({int(wall_ms)}ms)"
                                except Exception:
                                    pass
                        j.progress_phase = f"{phase}{suffix}"
                    j.locked_at = now2
                    j.locked_by = self.instance_id
                    j.lease_expires_at = now2 + timedelta(seconds=self.lease_seconds)
                    s.add(j)
                    s.commit()
                except Exception:
                    s.rollback()
                finally:
                    s.close()

            # Refresh lease before executing.
            now = _utcnow()
            job.locked_at = now
            job.lease_expires_at = now + timedelta(seconds=self.lease_seconds)
            db.add(job)
            db.commit()

            try:
                result = await _run_release_gate(
                    int(job.project_id),
                    payload,
                    db,
                    user,
                    cancel_check=cancel_check,
                    progress_hook=progress_hook,
                )
            except ReleaseGateCancelled:
                job.status = "canceled"
                job.finished_at = _utcnow()
                job.error_detail = None
                job.locked_at = None
                job.locked_by = None
                job.lease_expires_at = None
                job.progress_phase = "canceled"
                db.add(job)
                db.commit()
                return

            # CAS: never let succeeded overwrite an in-flight cancel request.
            finished = _utcnow()
            result_json = result if isinstance(result, dict) else {"result": result}
            rid = result.get("report_id") if isinstance(result, dict) else None
            if isinstance(result, dict):
                passed = bool(result.get("pass"))
                reason = ""
                if not passed:
                    reasons = result.get("failure_reasons") or []
                    if isinstance(reasons, list) and reasons:
                        reason = str(reasons[0])
                    else:
                        reason = str(result.get("summary") or "release gate failed")
                ops_alerting.observe_release_gate_result(
                    project_id=int(job.project_id),
                    success=passed,
                    error_summary=reason,
                )
            updated = (
                db.query(ReleaseGateJob)
                .filter(
                    ReleaseGateJob.id == job_id,
                    ReleaseGateJob.status == "running",
                    ReleaseGateJob.cancel_requested_at.is_(None),
                )
                .update(
                    {
                        "status": "succeeded",
                        "finished_at": finished,
                        "progress_done": int(payload.repeat_runs or 0) or (job.progress_done or 0),
                        "progress_total": int(payload.repeat_runs or 0) or job.progress_total,
                        "progress_phase": "succeeded",
                        "result_json": result_json,
                        "report_id": str(rid) if rid else job.report_id,
                        "error_detail": None,
                        "locked_at": None,
                        "locked_by": None,
                        "lease_expires_at": None,
                    },
                    synchronize_session=False,
                )
            )
            db.commit()
            if not updated:
                # If cancel was requested during execution, honor cancel as the terminal state.
                job2 = db.query(ReleaseGateJob).filter(ReleaseGateJob.id == job_id).first()
                if job2 and (job2.cancel_requested_at is not None or str(job2.status).lower() == "canceled"):
                    job2.status = "canceled"
                    job2.finished_at = finished
                    job2.progress_phase = "canceled"
                    job2.error_detail = None
                    job2.locked_at = None
                    job2.locked_by = None
                    job2.lease_expires_at = None
                    # Do not persist result payload for canceled runs (avoids confusing UX).
                    job2.result_json = None
                    job2.report_id = None
                    db.add(job2)
                    db.commit()
        except Exception as e:
            project_id = int(getattr(job, "project_id", 0) or 0)
            if project_id > 0:
                ops_alerting.observe_release_gate_result(
                    project_id=project_id,
                    success=False,
                    error_summary=f"exception:{type(e).__name__}",
                )
            try:
                job = db.query(ReleaseGateJob).filter(ReleaseGateJob.id == job_id).first()
                if job and str(job.status) != "canceled" and getattr(job, "cancel_requested_at", None) is None:
                    # CAS-ish: only mark failed when job was not canceled.
                    job.status = "failed"
                    job.finished_at = _utcnow()
                    detail = getattr(e, "detail", None)
                    if isinstance(detail, dict):
                        job.error_detail = detail
                    else:
                        job.error_detail = {"message": str(e)}
                    job.locked_at = None
                    job.locked_by = None
                    job.lease_expires_at = None
                    job.progress_phase = "failed"
                    db.add(job)
                    db.commit()
            except Exception:
                db.rollback()
            raise
        finally:
            db.close()


release_gate_job_runner = ReleaseGateJobRunner()

