# MVP Operational Alerting (Minimum Plan)

## Purpose

Define a practical, low-noise operational alerting baseline for MVP production use.
This plan targets "small team reliability" rather than full enterprise incident management.

---

## Scope

- In scope:
  - API availability and latency degradation alerts
  - Release Gate execution failure alerts
  - Database connectivity/error burst alerts
  - High agent error-rate anomaly alerts
- Out of scope (post-MVP):
  - On-call rotation tooling
  - Multi-channel escalation trees
  - Full SLO burn-rate automation

---

## Alert Channels

- Primary: Slack webhook (single ops channel)
- Secondary: Email digest (optional, async summary)

---

## Alert Rules (Phase 1)

### OPS-1: Live View API degradation

- Signal:
  - `GET /api/v1/projects/{project_id}/live-view/agents`
- Trigger:
  - 5xx rate > 5% in 5-minute window, or
  - p95 latency > 3000 ms in 5-minute window
- Severity: warning
- Message template:
  - `[Alert] Live View API degradation`
  - `project={project_id|multiple} 5xx_rate={x}% p95={y}ms endpoint=/live-view/agents`

### OPS-2: Release Gate run failures

- Signal:
  - `POST /api/v1/projects/{project_id}/release-gate/validate`
  - `POST /api/v1/projects/{project_id}/release-gate/validate-async`
- Trigger:
  - Same project fails 3+ runs in 10 minutes, or
  - Job status `failed` with provider/auth/database tagged error
- Severity: warning (critical for repeated provider/auth failures)
- Message template:
  - `[Alert] Release Gate failures`
  - `project={project_id} failures_10m={count} last_error={error_summary}`

### OPS-3: Database connectivity/error burst

- Signal:
  - DB connection/transaction exceptions in backend logs
- Trigger:
  - Same DB error class appears 10+ times in 5 minutes
- Severity: critical
- Message template:
  - `[Critical] Database error burst`
  - `error={error_class} count_5m={count}`

### OPS-4: High snapshot error-rate anomaly

- Signal:
  - Snapshot write outcomes and status codes by project
- Trigger:
  - `status_code >= 500` ratio > 20% over last 10 minutes per project
- Severity: warning
- Message template:
  - `[Alert] High agent error rate`
  - `project={project_id} error_ratio_10m={ratio}% samples={n}`

---

## Anti-Noise Guardrails

- Cooldown:
  - Do not re-send the same alert key more than once every 10 minutes.
- Dedup key:
  - `alert_type + project_id + error_class` (or endpoint for API-level alerts)
- Recovery message:
  - Send one "recovered" notification when metric returns below threshold.

---

## Implementation Notes (Phase 2)

- Recommended integration points:
  - `backend/app/middleware/logging_middleware.py` for request metrics
  - `backend/app/api/v1/endpoints/release_gate.py` for run/job failure tagging
  - `backend/app/core/exceptions.py` (or DB session boundary) for DB error classification
- Introduce a single notifier abstraction:
  - `notify_ops_alert(event_type: str, payload: dict) -> None`
- Keep notifier side effects non-blocking (best-effort, never fail request path).

---

## Manual Verification Checklist

- [ ] OPS-T1: Force Live View API 500 and verify warning alert payload
- [ ] OPS-T2: Trigger 3 Release Gate failures in 10 min and verify warning alert payload
- [ ] OPS-T3: Simulate DB error burst and verify critical alert payload
- [ ] OPS-T4: Create high 5xx snapshot ratio and verify anomaly alert payload
- [ ] OPS-T5: Verify cooldown/dedup suppresses repeated spam alerts
- [ ] OPS-T6: Verify recovery message is emitted once after stabilization
- [ ] OPS-T7: Use admin dry-run endpoint (`POST /api/v1/admin/ops-alerts/test`) to validate webhook wiring in a controlled way

---

## Exit Criteria

- Rule definitions are documented and linked from MVP checklist and manual test scenarios.
- Manual test scenarios exist for all Phase 1 alerts.
- Alert messages are English-only and actionable.
