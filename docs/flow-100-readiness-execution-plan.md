# Flow 100% Readiness Execution Plan

This document closes the remaining gap between "core flows mostly stable" and "all user flows operationally trusted."

## Goal

Drive the remaining three risks to controlled state:

1. Frontend E2E full-surface coverage (real browser)
2. Long-run/high-load soak qualification
3. Sandbox/live webhook operational monitoring for at least 7 days

## Scope and Success Criteria

### A) Frontend E2E Full Sweep

Required outcomes:

- Every quota-related user action is covered by at least one real-browser E2E path.
- Every over-limit action verifies:
  - proactive disable state when applicable
  - backend rejection fallback when direct request is attempted
  - banner copy + CTA target (`/settings/billing`)
- Release Gate settings combinations are covered for critical permutations:
  - detected baseline
  - platform-hosted mode
  - custom provider + model + direct key
  - saved key mismatch paths

Exit gate:

- Required E2E suite passes twice in a row on clean environment.

### B) Soak and High-Load Qualification

Required outcomes:

- Repeat-run and large snapshot combinations complete within agreed timeout budget.
- No unbounded memory growth during stress loops.
- Failures are categorized (limit/policy/provider/system) without opaque errors.

Exit gate:

- Soak loop target run count completes with zero unknown errors.
- 95th percentile duration and peak memory stay within budgets.

### C) 7-Day Webhook Operational Monitoring

Required outcomes:

- Webhook processing errors are observed, triaged, and resolved via retry/reconcile loop.
- Alert thresholds are applied and reviewed daily.
- No unresolved billing mismatch older than SLA.

Exit gate:

- 7 consecutive days with:
  - no uncategorized webhook failures
  - no stuck DLQ item beyond target window
  - documented daily checks

## Execution Tracks

### Track 1 - E2E Coverage Expansion

1. Build a quota action matrix from real screens:
   - org create
   - project create
   - member invite
   - snapshot-producing actions (Live View)
   - hosted replay actions (Release Gate)
2. For each action add/verify:
   - enabled path success
   - near-limit warning visibility (80%+)
   - over-limit exhausted handling (100%)
   - billing CTA routing
3. Add Release Gate matrix checks:
   - detected mode key present/missing
   - custom mode direct key valid/invalid
   - saved key provider match/mismatch

Deliverables:

- expanded Playwright suite under `frontend/tests`
- runbook entry for required env vars and deterministic seed strategy

### Track 2 - Soak Qualification

1. Define soak profile set:
   - low: small snapshots, low repeats
   - medium: realistic daily production profile
   - high: max realistic repeat/snapshot combination
2. Execute repeated qualification loops and capture:
   - pass/fail per iteration
   - duration per run
   - memory/CPU envelopes
3. Add regression buckets for previously broken paths.

Deliverables:

- soak runner scripts (`scripts/run-release-gate-soak.ps1`, `scripts/run-release-gate-soak.sh`)
- archived output log per run

### Track 3 - Webhook 7-Day Monitoring

1. Start daily monitoring cadence:
   - metric snapshot pull
   - error ratio check
   - duplicate spike check
2. If threshold exceeded:
   - retry specific failed events
   - run reconcile
   - file incident note with root cause category
3. Keep daily evidence log for 7+ days.

Deliverables:

- monitoring helper scripts (`scripts/check-billing-webhook-metrics.ps1`, `scripts/check-billing-webhook-metrics.sh`)
- daily checklist records in ops notes

## Risk Controls

### Operational Durability

- enforce daily webhook checks
- define alert-to-recovery SLA
- keep one deterministic support procedure for "paid but blocked"

### Long-tail UX

- whenever proactive disable cannot be deterministic, force canonical reject banner behavior
- enforce one copy policy for each error code via shared parser + banner mapping

### High-load Stability

- run soak before each release candidate
- treat unknown error category as release blocker
- pin max `repeat_runs` defaults conservatively until soak budgets are consistently met

## Run Commands

Frontend E2E:

- `cd frontend && npm run e2e:quota-matrix`
- `cd frontend && npm run e2e:release-gate-matrix`

Backend qualification and soak:

- `cd backend && python -m pytest -c pytest-ci.ini tests/integration/test_release_gate_preflight_guards.py tests/integration/test_release_gate_overrides_and_export.py tests/integration/test_release_gate_async_jobs.py tests/unit/test_release_gate_model_policy.py tests/unit/test_live_eval_service.py -q`
- `./scripts/run-release-gate-soak.sh` (Linux/macOS)
- `powershell -ExecutionPolicy Bypass -File scripts/run-release-gate-soak.ps1` (Windows)
- Note: use cooldown between iterations (`COOLDOWN_SEC=65` or `-CooldownSec 65`) to avoid endpoint rate-limit false negatives during repeated stress loops.

Webhook monitoring:

- `./scripts/check-billing-webhook-metrics.sh` (Linux/macOS)
- `powershell -ExecutionPolicy Bypass -File scripts/check-billing-webhook-metrics.ps1` (Windows)

## Completion Criteria

Mark this package complete only when all are true:

- [ ] Expanded E2E suite covers all quota-consuming UI actions and passes consistently
- [ ] Release Gate settings matrix critical permutations are validated in browser
- [ ] Soak profile set completes without unknown failures and within budgets
- [ ] Webhook monitoring shows stable operation for 7+ consecutive days
- [ ] Incident/recovery evidence exists for any triggered alert during window
- [ ] Go-live sign-off includes this document and `docs/billing-hardening-runbook.md`

## Execution Logging Policy

- Keep operational evidence in `docs/billing-webhook-7day-monitoring-template.md`.
- Fill Day-1 immediately after first full 20-iteration cooldown soak run completes.
- Continue one row per calendar day (Day-2 through Day-7) with:
  - webhook checker output
  - retries/reconcile actions (if any)
  - soak summary path or run-reference note

## Current Execution Status

- Day-1 recorded in `docs/billing-webhook-7day-monitoring-template.md`.
- 20-iteration cooldown soak completed:
  - summary: `logs/soak/release-gate-soak-20260328-015759-summary.txt`
  - result: `failures=0`
- Day-2 onward: append one row per day using the same format and checklist (see `docs/billing-webhook-7day-monitoring-template.md` → Day-2 through Day-7).

## Next actions

1. Each calendar day: run Day-2+ ritual in `docs/billing-webhook-7day-monitoring-template.md` until the table is complete.
2. Expand Playwright coverage toward full Release Gate settings matrix (Core Setup, Environment Parity, Preview, tools/overrides) — see Track 1 criteria above.
3. Re-run production/staging `METRICS_URL` webhook check when `billing_webhook_events_total` is present (closes `observability_gap` on Day-1 style rows).
