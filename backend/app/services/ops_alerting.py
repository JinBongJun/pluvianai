"""
Lightweight operational alerting for MVP.

Design goals:
- Non-blocking best-effort delivery (never fail request paths)
- In-memory windows/counters (process-local)
- Cooldown + dedup to reduce alert noise
"""

from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from threading import Lock, Thread
from time import time
from typing import Deque, Dict, Tuple
import json
import math
import httpx

from app.core.config import settings
from app.core.logging_config import logger


@dataclass
class _TimedBool:
    ts: float
    is_error: bool


class OpsAlertingService:
    def __init__(self) -> None:
        self._lock = Lock()
        self._last_sent_by_key: Dict[str, float] = {}
        self._active_conditions: Dict[str, bool] = {}

        # Process-local rolling windows.
        self._live_view_events: Dict[int, Deque[Tuple[float, int, float]]] = defaultdict(deque)
        self._project_api_events: Dict[Tuple[int, str], Deque[Tuple[float, int, float]]] = defaultdict(deque)
        self._release_gate_failures: Dict[int, Deque[Tuple[float, str]]] = defaultdict(deque)
        self._release_gate_outcomes: Dict[int, Deque[_TimedBool]] = defaultdict(deque)
        self._provider_errors: Dict[Tuple[int, str, str], Deque[float]] = defaultdict(deque)
        self._db_errors: Dict[str, Deque[float]] = defaultdict(deque)
        self._snapshot_status: Dict[int, Deque[_TimedBool]] = defaultdict(deque)
        self._alert_frequency: Dict[str, Deque[float]] = defaultdict(deque)
        self._release_gate_tool_missing_ratios: Dict[int, Deque[Tuple[float, float]]] = defaultdict(deque)

    @property
    def enabled(self) -> bool:
        return bool(getattr(settings, "OPS_ALERT_WEBHOOK_URL", None))

    def observe_live_view_agents_request(
        self,
        project_id: int,
        status_code: int,
        duration_ms: float,
    ) -> None:
        now = time()
        window_s = int(getattr(settings, "OPS_LIVE_VIEW_WINDOW_SECONDS", 300))
        min_samples = int(getattr(settings, "OPS_LIVE_VIEW_MIN_SAMPLES", 5))
        with self._lock:
            q = self._live_view_events[project_id]
            q.append((now, int(status_code), float(duration_ms)))
            self._prune_triplets(q, now, window_s)
            total = len(q)
            if total == 0:
                return

            errors = sum(1 for _ts, sc, _dur in q if sc >= 500)
            error_rate = errors / total
            durations = sorted(d for _ts, _sc, d in q)
            p95_ms = self._percentile(durations, 0.95)

        err_threshold = float(getattr(settings, "OPS_LIVE_VIEW_5XX_RATE_THRESHOLD", 0.05))
        p95_threshold = float(getattr(settings, "OPS_LIVE_VIEW_P95_MS_THRESHOLD", 3000))
        is_degraded = total >= min_samples and (error_rate > err_threshold or p95_ms > p95_threshold)
        key = f"live_view_api_degraded:{project_id}"
        if is_degraded:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="warning",
                title="Live View API degradation",
                summary=(
                    f"project={project_id} endpoint=/live-view/agents "
                    f"5xx_rate={error_rate * 100:.1f}% p95={p95_ms:.0f}ms samples={total}"
                ),
                payload={
                    "event_type": "live_view_api_degraded",
                    "project_id": project_id,
                    "error_rate": round(error_rate, 4),
                    "p95_ms": round(p95_ms, 1),
                    "samples": total,
                    "window_seconds": window_s,
                },
                mark_active=True,
            )
        elif total >= min_samples:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title="Live View API recovered",
                summary=f"project={project_id} endpoint=/live-view/agents is back within thresholds",
                payload={
                    "event_type": "live_view_api_recovered",
                    "project_id": project_id,
                    "error_rate": round(error_rate, 4),
                    "p95_ms": round(p95_ms, 1),
                    "samples": total,
                },
            )

    def observe_project_api_request(
        self,
        project_id: int,
        endpoint_group: str,
        status_code: int,
        duration_ms: float,
    ) -> None:
        now = time()
        normalized_group = str(endpoint_group or "unknown").strip().lower() or "unknown"
        window_s = int(getattr(settings, "OPS_PROJECT_API_WINDOW_SECONDS", 300))
        min_samples = int(getattr(settings, "OPS_PROJECT_API_MIN_SAMPLES", 20))

        with self._lock:
            q = self._project_api_events[(project_id, normalized_group)]
            q.append((now, int(status_code), float(duration_ms)))
            self._prune_triplets(q, now, window_s)
            total = len(q)
            if total == 0:
                return
            errors = sum(1 for _ts, sc, _dur in q if sc >= 500)
            error_rate = errors / total
            durations = sorted(d for _ts, _sc, d in q)
            p95_ms = self._percentile(durations, 0.95)

        err_threshold = float(getattr(settings, "OPS_PROJECT_API_5XX_RATE_THRESHOLD", 0.05))
        p95_threshold = float(getattr(settings, "OPS_PROJECT_API_P95_MS_THRESHOLD", 3000))
        is_degraded = total >= min_samples and (error_rate > err_threshold or p95_ms > p95_threshold)
        key = f"project_api_degraded:{project_id}:{normalized_group}"
        if is_degraded:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="warning",
                title=f"Project API degradation ({normalized_group})",
                summary=(
                    f"project={project_id} group={normalized_group} "
                    f"5xx_rate={error_rate * 100:.1f}% p95={p95_ms:.0f}ms samples={total}"
                ),
                payload={
                    "event_type": "project_api_degraded",
                    "project_id": project_id,
                    "endpoint_group": normalized_group,
                    "error_rate": round(error_rate, 4),
                    "p95_ms": round(p95_ms, 1),
                    "samples": total,
                    "window_seconds": window_s,
                },
                mark_active=True,
            )
        else:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title=f"Project API recovered ({normalized_group})",
                summary=f"project={project_id} group={normalized_group} is back within thresholds",
                payload={
                    "event_type": "project_api_recovered",
                    "project_id": project_id,
                    "endpoint_group": normalized_group,
                    "error_rate": round(error_rate, 4),
                    "p95_ms": round(p95_ms, 1),
                    "samples": total,
                },
            )

    def observe_release_gate_result(
        self,
        project_id: int,
        success: bool,
        error_summary: str = "",
    ) -> None:
        now = time()
        window_s = int(getattr(settings, "OPS_RELEASE_GATE_WINDOW_SECONDS", 600))
        threshold = int(getattr(settings, "OPS_RELEASE_GATE_FAILURE_BURST_COUNT", 3))
        key = f"release_gate_failure_burst:{project_id}"
        ratio_window_s = int(getattr(settings, "OPS_RELEASE_GATE_RATIO_WINDOW_SECONDS", 3600))
        ratio_min_samples = int(getattr(settings, "OPS_RELEASE_GATE_RATIO_MIN_SAMPLES", 10))
        ratio_threshold = float(getattr(settings, "OPS_RELEASE_GATE_FAIL_RATIO_THRESHOLD", 0.15))
        ratio_key = f"release_gate_fail_ratio_high:{project_id}"

        with self._lock:
            q = self._release_gate_failures[project_id]
            if not success:
                q.append((now, (error_summary or "unknown").strip()[:220]))
            self._prune_failure_tuples(q, now, window_s)
            count = len(q)
            last_error = q[-1][1] if q else ""
            outcomes = self._release_gate_outcomes[project_id]
            outcomes.append(_TimedBool(ts=now, is_error=not bool(success)))
            self._prune_timed_bools(outcomes, now, ratio_window_s)
            ratio_total = len(outcomes)
            ratio_failures = sum(1 for item in outcomes if item.is_error)
            fail_ratio = (ratio_failures / ratio_total) if ratio_total else 0.0

        if count >= threshold:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="warning",
                title="Release Gate failure burst",
                summary=(
                    f"project={project_id} failures_10m={count} "
                    f"last_error={last_error or 'n/a'}"
                ),
                payload={
                    "event_type": "release_gate_failure_burst",
                    "project_id": project_id,
                    "failures_window_count": count,
                    "window_seconds": window_s,
                    "last_error": last_error,
                },
                mark_active=True,
            )
        elif success:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title="Release Gate recovered",
                summary=f"project={project_id} no active failure burst detected",
                payload={
                    "event_type": "release_gate_recovered",
                    "project_id": project_id,
                    "failures_window_count": count,
                    "window_seconds": window_s,
                },
            )

        is_ratio_high = ratio_total >= ratio_min_samples and fail_ratio > ratio_threshold
        if is_ratio_high:
            self._emit_alert_if_needed(
                dedup_key=ratio_key,
                severity="warning",
                title="Release Gate high fail ratio",
                summary=(
                    f"project={project_id} fail_ratio={fail_ratio * 100:.1f}% "
                    f"samples={ratio_total} (window={ratio_window_s}s)"
                ),
                payload={
                    "event_type": "release_gate_fail_ratio_high",
                    "project_id": project_id,
                    "fail_ratio": round(fail_ratio, 4),
                    "failed_runs": ratio_failures,
                    "samples": ratio_total,
                    "window_seconds": ratio_window_s,
                },
                mark_active=True,
            )
        else:
            self._emit_recovery_if_needed(
                dedup_key=ratio_key,
                severity="info",
                title="Release Gate fail ratio recovered",
                summary=f"project={project_id} fail ratio is back within threshold",
                payload={
                    "event_type": "release_gate_fail_ratio_recovered",
                    "project_id": project_id,
                    "fail_ratio": round(fail_ratio, 4),
                    "failed_runs": ratio_failures,
                    "samples": ratio_total,
                    "window_seconds": ratio_window_s,
                },
            )

    def observe_provider_error(
        self,
        project_id: int,
        provider: str,
        error_code: str,
        error_summary: str = "",
    ) -> None:
        now = time()
        normalized_provider = str(provider or "unknown").strip().lower() or "unknown"
        normalized_error_code = str(error_code or "unknown_error").strip().lower() or "unknown_error"
        window_s = int(getattr(settings, "OPS_PROVIDER_ERROR_WINDOW_SECONDS", 600))
        threshold = int(getattr(settings, "OPS_PROVIDER_ERROR_BURST_COUNT", 5))
        key = f"provider_error_burst:{project_id}:{normalized_provider}:{normalized_error_code}"

        with self._lock:
            q = self._provider_errors[(project_id, normalized_provider, normalized_error_code)]
            q.append(now)
            self._prune_floats(q, now, window_s)
            count = len(q)

        if count >= threshold:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="warning",
                title="LLM provider error burst",
                summary=(
                    f"project={project_id} provider={normalized_provider} code={normalized_error_code} "
                    f"count={count} last={str(error_summary or '').strip()[:180] or 'n/a'}"
                ),
                payload={
                    "event_type": "provider_error_burst",
                    "project_id": project_id,
                    "provider": normalized_provider,
                    "error_code": normalized_error_code,
                    "count_window": count,
                    "window_seconds": window_s,
                },
                mark_active=True,
            )
        else:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title="LLM provider errors recovered",
                summary=(
                    f"project={project_id} provider={normalized_provider} "
                    f"code={normalized_error_code} is below threshold"
                ),
                payload={
                    "event_type": "provider_error_recovered",
                    "project_id": project_id,
                    "provider": normalized_provider,
                    "error_code": normalized_error_code,
                    "count_window": count,
                    "window_seconds": window_s,
                },
            )

    def observe_db_error(self, error_class: str) -> None:
        now = time()
        window_s = int(getattr(settings, "OPS_DB_ERROR_WINDOW_SECONDS", 300))
        threshold = int(getattr(settings, "OPS_DB_ERROR_BURST_COUNT", 10))
        normalized = (error_class or "UnknownDBError").strip()
        key = f"db_error_burst:{normalized}"

        with self._lock:
            q = self._db_errors[normalized]
            q.append(now)
            self._prune_floats(q, now, window_s)
            count = len(q)

        if count >= threshold:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="critical",
                title="Database error burst",
                summary=f"error={normalized} count_5m={count}",
                payload={
                    "event_type": "db_error_burst",
                    "error_class": normalized,
                    "count_window": count,
                    "window_seconds": window_s,
                },
                mark_active=True,
            )
        else:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title="Database errors normalized",
                summary=f"error={normalized} count is below threshold",
                payload={
                    "event_type": "db_error_recovered",
                    "error_class": normalized,
                    "count_window": count,
                    "window_seconds": window_s,
                },
            )

    def observe_snapshot_status(self, project_id: int, status_code: int) -> None:
        now = time()
        window_s = int(getattr(settings, "OPS_SNAPSHOT_WINDOW_SECONDS", 600))
        min_samples = int(getattr(settings, "OPS_SNAPSHOT_ERROR_MIN_SAMPLES", 20))
        threshold = float(getattr(settings, "OPS_SNAPSHOT_5XX_RATIO_THRESHOLD", 0.20))
        key = f"snapshot_error_ratio_high:{project_id}"

        with self._lock:
            q = self._snapshot_status[project_id]
            q.append(_TimedBool(ts=now, is_error=int(status_code) >= 500))
            self._prune_timed_bools(q, now, window_s)
            total = len(q)
            errors = sum(1 for item in q if item.is_error)
            ratio = (errors / total) if total else 0.0

        is_high = total >= min_samples and ratio > threshold
        if is_high:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="warning",
                title="High snapshot error ratio",
                summary=f"project={project_id} error_ratio_10m={ratio * 100:.1f}% samples={total}",
                payload={
                    "event_type": "snapshot_error_ratio_high",
                    "project_id": project_id,
                    "error_ratio": round(ratio, 4),
                    "errors": errors,
                    "samples": total,
                    "window_seconds": window_s,
                },
                mark_active=True,
            )
        else:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title="Snapshot error ratio recovered",
                summary=f"project={project_id} snapshot error ratio is back within threshold",
                payload={
                    "event_type": "snapshot_error_ratio_recovered",
                    "project_id": project_id,
                    "error_ratio": round(ratio, 4),
                    "errors": errors,
                    "samples": total,
                },
            )

    def emit_test_alert(
        self,
        event_type: str,
        severity: str,
        title: str,
        summary: str,
        payload: Dict[str, object] | None = None,
    ) -> None:
        """
        Fire a dry-run ops alert immediately (admin-only caller expected).
        Bypasses threshold windows/cooldown by using direct dispatch.
        """
        self._dispatch(
            severity=severity,
            title=title,
            summary=summary,
            payload={
                "event_type": event_type,
                "dry_run": True,
                **(payload or {}),
            },
        )

    # --- Internal helpers ---
    def _emit_alert_if_needed(
        self,
        dedup_key: str,
        severity: str,
        title: str,
        summary: str,
        payload: Dict[str, object],
        mark_active: bool = False,
    ) -> None:
        cooldown_s = int(getattr(settings, "OPS_ALERT_COOLDOWN_SECONDS", 600))
        now = time()
        with self._lock:
            last_sent = self._last_sent_by_key.get(dedup_key)
            if last_sent is not None and (now - last_sent) < cooldown_s:
                return
            self._last_sent_by_key[dedup_key] = now
            if mark_active:
                self._active_conditions[dedup_key] = True
        self._dispatch(severity=severity, title=title, summary=summary, payload=payload)
        self._record_alert_frequency(str(payload.get("event_type") or "unknown"))

    def _emit_recovery_if_needed(
        self,
        dedup_key: str,
        severity: str,
        title: str,
        summary: str,
        payload: Dict[str, object],
    ) -> None:
        with self._lock:
            was_active = self._active_conditions.get(dedup_key, False)
            if not was_active:
                return
            self._active_conditions[dedup_key] = False
        recovery_key = f"{dedup_key}:recovery"
        self._emit_alert_if_needed(
            dedup_key=recovery_key,
            severity=severity,
            title=title,
            summary=summary,
            payload=payload,
            mark_active=False,
        )

    def _dispatch(self, severity: str, title: str, summary: str, payload: Dict[str, object]) -> None:
        if not self.enabled:
            logger.info(
                "OPS alert skipped (webhook not configured): %s | %s",
                title,
                summary,
            )
            return
        event = {
            "severity": severity,
            "title": title,
            "summary": summary,
            "payload": payload,
            "environment": getattr(settings, "ENVIRONMENT", "unknown"),
            "sent_at": int(time()),
        }
        Thread(target=self._send_sync, args=(event,), daemon=True).start()

    def _send_sync(self, event: Dict[str, object]) -> None:
        webhook = getattr(settings, "OPS_ALERT_WEBHOOK_URL", None)
        if not webhook:
            return
        text = (
            f"[{event.get('environment')}] [{str(event.get('severity')).upper()}] "
            f"{event.get('title')}\n{event.get('summary')}\n"
            f"payload={json.dumps(event.get('payload', {}), ensure_ascii=True)}"
        )
        try:
            with httpx.Client(timeout=4.0) as client:
                resp = client.post(webhook, json={"text": text})
                resp.raise_for_status()
            logger.info("OPS alert sent: %s", event.get("title"))
        except Exception as exc:
            logger.warning("OPS alert send failed: %s", str(exc))

    @staticmethod
    def _percentile(values: list[float], q: float) -> float:
        if not values:
            return 0.0
        if len(values) == 1:
            return float(values[0])
        idx = max(0, min(len(values) - 1, int(math.ceil(q * len(values)) - 1)))
        return float(values[idx])

    @staticmethod
    def _prune_triplets(q: Deque[Tuple[float, int, float]], now: float, window_s: int) -> None:
        while q and (now - q[0][0]) > window_s:
            q.popleft()

    @staticmethod
    def _prune_failure_tuples(q: Deque[Tuple[float, str]], now: float, window_s: int) -> None:
        while q and (now - q[0][0]) > window_s:
            q.popleft()

    @staticmethod
    def _prune_floats(q: Deque[float], now: float, window_s: int) -> None:
        while q and (now - q[0]) > window_s:
            q.popleft()

    @staticmethod
    def _prune_timed_bools(q: Deque[_TimedBool], now: float, window_s: int) -> None:
        while q and (now - q[0].ts) > window_s:
            q.popleft()

    @staticmethod
    def _prune_ts_float_pairs(q: Deque[Tuple[float, float]], now: float, window_s: int) -> None:
        while q and (now - q[0][0]) > window_s:
            q.popleft()

    def observe_release_gate_tool_missing_surge(
        self,
        project_id: int,
        *,
        evidence_rows: int,
        missing_rows: int,
    ) -> None:
        """
        §15.4: when tool_evidence rows exist but a high fraction is execution_source=missing,
        emit an ops alert (possible missing ingest or provider format drift).
        """
        if evidence_rows <= 0:
            return
        ratio = float(missing_rows) / float(evidence_rows)
        now = time()
        window_s = int(settings.OPS_RG_TOOL_MISSING_WINDOW_SECONDS)
        min_samples = int(settings.OPS_RG_TOOL_MISSING_MIN_SAMPLES)
        ratio_threshold = float(settings.OPS_RG_TOOL_MISSING_RATIO_THRESHOLD)
        key = f"release_gate_tool_missing_surge:{project_id}"

        with self._lock:
            q = self._release_gate_tool_missing_ratios[project_id]
            q.append((now, ratio))
            self._prune_ts_float_pairs(q, now, window_s)
            total = len(q)
            if total < min_samples:
                return
            avg_ratio = sum(r for _ts, r in q) / total

        if avg_ratio >= ratio_threshold:
            self._emit_alert_if_needed(
                dedup_key=key,
                severity="warning",
                title="Release Gate tool evidence mostly missing",
                summary=(
                    f"project={project_id} avg_missing_ratio={avg_ratio * 100:.1f}% "
                    f"samples={total} window={window_s}s (last={ratio * 100:.1f}% rows={evidence_rows})"
                ),
                payload={
                    "event_type": "release_gate_tool_missing_surge",
                    "project_id": project_id,
                    "avg_missing_ratio": round(avg_ratio, 4),
                    "last_sample_ratio": round(ratio, 4),
                    "evidence_rows_last": evidence_rows,
                    "missing_rows_last": missing_rows,
                    "samples": total,
                    "window_seconds": window_s,
                },
                mark_active=True,
            )
        else:
            self._emit_recovery_if_needed(
                dedup_key=key,
                severity="info",
                title="Release Gate tool missing ratio normalized",
                summary=f"project={project_id} avg_missing_ratio={avg_ratio * 100:.1f}% is below threshold",
                payload={
                    "event_type": "release_gate_tool_missing_recovered",
                    "project_id": project_id,
                    "avg_missing_ratio": round(avg_ratio, 4),
                    "samples": total,
                },
            )

    def _record_alert_frequency(self, event_type: str) -> None:
        normalized_event = str(event_type or "").strip().lower()
        if not normalized_event or normalized_event == "ops_alert_frequency_high":
            return

        now = time()
        window_s = int(getattr(settings, "OPS_ALERT_META_WINDOW_SECONDS", 3600))
        threshold = int(getattr(settings, "OPS_ALERT_META_FREQUENCY_THRESHOLD", 20))

        with self._lock:
            q = self._alert_frequency[normalized_event]
            q.append(now)
            self._prune_floats(q, now, window_s)
            count = len(q)

        if count >= threshold:
            self._emit_alert_if_needed(
                dedup_key=f"ops_alert_frequency_high:{normalized_event}",
                severity="warning",
                title="Ops alert frequency high",
                summary=(
                    f"event_type={normalized_event} sent={count} times in {window_s}s. "
                    "Possible noisy incident or threshold tuning needed."
                ),
                payload={
                    "event_type": "ops_alert_frequency_high",
                    "source_event_type": normalized_event,
                    "count_window": count,
                    "window_seconds": window_s,
                },
                mark_active=False,
            )


ops_alerting = OpsAlertingService()
