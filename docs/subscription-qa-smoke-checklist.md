# Subscription QA Smoke Checklist

Use this checklist for the final paid-usage regression pass after subscription, quota, Live View, and Release Gate changes.

## Goal

Verify four user-facing outcomes:

1. Monthly usage resets on the next billing period.
2. Live View accepts and shows new snapshots again after quota is available.
3. Release Gate hosted mode becomes selectable again after hosted replay credits are available.
4. Project creation is blocked/unblocked consistently from the same account usage source.

## Setup

- Use a staging account where you can control or observe subscription state.
- Keep one organization and one project available for Live View / Release Gate checks.
- Prefer two account states:
  - quota exhausted
  - quota available again
- Open:
  - `Settings -> Usage`
  - `Organizations`
  - `Projects`
  - `Live View`
  - `Release Gate`

## Fast Manual Pass

### 1. Account usage source of truth

- Open `Settings -> Usage`.
- Note the current plan, project limit, org limit, snapshots used, and hosted replay credits used.
- Open `Organizations`, `Projects`, and `Release Gate`.

Expected:

- The plan and quota-driven UI should agree with `Settings -> Usage`.
- UI should not behave as if orgs, projects, Live View, and Release Gate are reading different entitlement states.

### 2. Project creation gate

- If the account is already at the project limit, open `Organizations -> {org} -> Projects`.
- Confirm `NEW PROJECT` is disabled.
- Open `/organizations/{orgId}/projects/new` directly.

Expected:

- The list page CTA is disabled.
- The new-project page shows the plan limit banner and does not allow submit.

### 3. Live View quota recovery

- While snapshot quota is exhausted, trigger one new tracked call.
- Confirm the new snapshot does not appear as a normal accepted snapshot.
- Restore available snapshot quota by moving to the next billing period or by using a staging account with quota available.
- Trigger one new tracked call again.

Expected:

- After quota becomes available, new snapshots appear again in Live View without requiring code changes or cache clearing.

### 4. Release Gate hosted replay recovery

- While hosted replay credits are exhausted, open Release Gate settings.
- Confirm `Hosted by PluvianAI` is disabled.
- Restore available hosted replay credits by moving to the next billing period or by using a staging account with quota available.
- Re-open Release Gate settings.

Expected:

- `Hosted by PluvianAI` becomes selectable again.
- `Custom (BYOK)` remains available throughout.

## Billing Period Reset Check

Use one of these approaches:

- Preferred: staging DB / sandbox billing state mutation
  - move `current_period_start` / `current_period_end` to the next period
  - re-run any reconciliation / usage refresh flow if your environment requires it
- Alternative: use a second staging account already in a fresh billing period

Expected:

- `Settings -> Usage` reflects the new billing window.
- Snapshot / replay usage is recalculated for the new period.
- Quota-gated UI becomes available again when the new period has remaining quota.

## Suggested Evidence To Capture

- Screenshot of `Settings -> Usage` before and after the billing-period change.
- Screenshot of disabled `NEW PROJECT`.
- Screenshot of disabled `Hosted by PluvianAI`.
- Screenshot or trace of new Live View snapshot appearing after quota recovery.

## Automated Checks To Run Alongside Manual QA

- Backend:
  - `python -m pytest tests/unit/test_usage_limits.py -q --tb=short`
  - `python -m pytest tests/unit/test_billing_service.py tests/unit/test_subscription_service_plan_limits.py -q --tb=short`
  - `python -m pytest tests/integration/test_api_auth.py::TestAuthAPI::test_get_my_usage_includes_platform_replay_credit_fields -q --tb=short`
  - `python -m pytest tests/integration/test_api_projects.py::TestProjectsAPI::test_project_limit_error_includes_normalized_details -q --tb=short`
  - `python -m pytest tests/integration/test_live_view_snapshot_routes.py tests/integration/test_release_gate_preflight_guards.py -q --tb=short`
- Schema parity:
  - `python -m alembic upgrade head`
  - `python -m alembic check`

## Exit Criteria

You can close the work when all of these are true:

- `alembic check` reports no new upgrade operations.
- Automated usage / billing / quota tests pass.
- Project creation gate is disabled at the limit and allowed again below the limit.
- Live View accepts new snapshots again after quota recovery.
- Release Gate hosted mode is disabled while exhausted and selectable again after recovery.
