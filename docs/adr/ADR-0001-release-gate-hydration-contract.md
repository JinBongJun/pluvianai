# ADR-0001: Release Gate result hydration and merge contract (frontend)

## Status

Accepted — reflects `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateResultHydration.ts` as of 2026-04.

## Context

Release Gate stacks completed runs in the client and rehydrates from server history after reload or re-login. Without a written contract, merge rules drift and PRs can silently change ordering or deletion semantics.

## Decision

### 1. Identity and deduplication

- **`report_id` is the merge key** for stacked completed results (`CompletedReleaseGateResultEntry`).
- **`mergeCompletedReleaseGateEntries`**: for each `report_id`, keep a single entry — the one with the **largest `completedAtMs`** wins (ties favor the incoming entry when timestamps are equal because `>=` is used).

### 2. Timestamps (`completedAtMs`)

- **`parseCompletedAtMs`**: if the input string is empty or whitespace → **`Date.now()`**. If `Date.parse` is not finite → **`Date.now()`**.
- **`mapExportedReportToCompletedReleaseGateEntry`**: uses `report.created_at` with optional `fallbackCreatedAt`.
- **`mapHistoryItemToCompletedReleaseGateEntry`**: uses `parseCompletedAtMs(item.session_created_at ?? item.created_at)`.

### 3. History → hydration targets (`buildReleaseGateReportHydrationTargets`)

- Input list order is **API/history order** (newest-first is typical for history endpoints).
- For each item, derive `(reportId, createdAt, sessionResult)` with  
  `createdAt = item.session_created_at ?? item.created_at ?? null`.
- **First occurrence of each `report_id` wins**; later duplicates are skipped (stable unique list in history order).
- Result is **sliced to `limit`** (max number of reports to hydrate in one pass).

### 4. Deletion and dismissal

- **`removeCompletedReleaseGateEntry`**: removes stacked entry matching `report_id` (trimmed); no server call in this helper.
- **`removeDismissedReleaseGateReportId`**: removes a `report_id` from the dismissed-id list used for UI state.
- **Hard delete of server history** is out of scope for this ADR; product behavior must clear client state in the same user action that deletes server rows (see implementation in `useReleaseGateValidateRun`).

### 5. Data precedence

- **Merge of stacked entries**: **incoming vs existing** is resolved by **`completedAtMs`** only (not by deep-merge of `result` fields).
- **Hydration from history**: each target’s `sessionResult` comes from the **history row that won deduplication** (first occurrence in ordered history for that `report_id`).

## Consequences

- Any change to merge order, dedupe, or timestamp fallback **must** update:
  - `releaseGateResultHydration.ts`
  - `useReleaseGateValidateRun.test.ts` / `releaseGateResultHydration` tests
  - This ADR
- QA/FE/BE review: confirm acceptance when behavior visible in UI (stack order, reload, delete).

## Related tests

- `frontend/.../release-gate/useReleaseGateValidateRun.test.ts` (merge, hydration targets, parse fallback)
- `frontend/lib/react-flow/graphContracts.test.ts` (Live View vs Release Gate graph consistency; separate concern)

## E2E prerequisites (Live View / Laboratory)

Browser E2E under `frontend/tests/live-view-laboratory-e2e.spec.ts` requires:

- `PLAYWRIGHT_E2E_EMAIL`, `PLAYWRIGHT_E2E_PASSWORD`
- Running API (`PLAYWRIGHT_API_URL` / default `http://127.0.0.1:8000`) and app (`PLAYWRIGHT_BASE_URL`)

**DoD / soak:** CI “N consecutive passes” or flake rate targets are enforced by **re-running the same job** or `npx playwright test --repeat-each=N` (see team runbook); not encoded in a single test file.

## Change control

Pull requests that touch hydration or merge behavior must tick **“Release Gate hydration contract (ADR-0001)”** in the PR template.
