# Behavior Wedge Cleanup Checklist

Purpose: reduce UI/logic surface area to support the product wedge:
`Incident -> Validate -> Report -> Rerun`.

This checklist focuses on three areas only:
- `Live View`
- `Test Lab`
- `Behavior`

Guiding rule:
- Keep only features that directly improve behavior validation accuracy, speed, or trust.
- Remove, hide, or defer visual simulations and unused interaction branches.

---

## 0) Current State Snapshot (validated)

- Live validation loop exists:
  - `Live View` -> `Validate Latest Trace` is wired to `behaviorAPI.validate(trace_id)`.
  - `Test Lab` -> `Validate Run` is wired to `behaviorAPI.validate(test_run_id)`.
- Behavior report metadata exists:
  - `summary.target`, `summary.runtime`, `summary.run_meta`, `violations[].evidence.step_context`.
- Known over-scope/low-value zones:
  - `LiveGraphView` + modal stack (`TraceDetailModal`, `TransactionDetailModal`) use synthetic/mocked display behavior.
  - `TestLabToolbar` has TODO click handlers for red team/privacy/compliance.
  - `TestLabInspector.runSimulation()` produces fake logs (not persisted backend run data).
  - `SafetyCertificate` is static/mock-first UI in current flow.

---

## 1) Priority Matrix

Use this matrix for all tasks below.

- `P0`: directly blocks reliable wedge loop
- `P1`: materially improves signal-to-noise for wedge
- `P2`: cosmetic or optional optimization

Effort scale:
- `S`: < 0.5 day
- `M`: 0.5 to 1.5 days
- `L`: > 1.5 days

---

## 2) Live View Cleanup

### LV-1 (P0, M): Remove synthetic graph path and make one source of truth

Files involved:
- `frontend/components/live-view/TriageDashboard.tsx`
- `frontend/components/live-view/LiveGraphView.tsx`
- `frontend/components/live-view/TraceDetailModal.tsx`
- `frontend/components/live-view/TransactionDetailModal.tsx`
- `frontend/app/organizations/[orgId]/projects/[projectId]/live-view/page.tsx`

Checklist:
- [x] Decide: keep `ReactFlow` in page-level live view as the only live topology renderer.
- [x] Remove `TriageDashboard` embedding from page or gate behind feature flag (`disabled` by default).
- [x] If removed, delete dead props (`onSelectSession`) and dead imports.
- [ ] Confirm node selection still opens right panel and `ClinicalLog`.
- [ ] Confirm `Validate Latest Trace` still works after cleanup.

Acceptance criteria:
- [x] No synthetic/random node telemetry remains in default live path.
- [x] Live view uses only backend-backed `agents` + `connections` + `snapshots`.
- [ ] User can: click node -> open logs -> run validate -> see result text.

Rollback note:
- Keep old components in git history; do not partially retain both render systems.

---

### LV-2 (P1, S): Replace marketing-like empty-state SDK text with product-accurate copy

Files involved:
- `frontend/app/organizations/[orgId]/projects/[projectId]/live-view/page.tsx`

Checklist:
- [x] Replace SDK install snippet and naming that is not current canonical package guidance.
- [x] Keep empty state short and task-driven:
  - "Send first snapshot"
  - "Select agent"
  - "Validate latest trace"
- [ ] Add direct link to behavior reports with pre-filter if possible.

Acceptance criteria:
- [x] Empty state text maps to actual integration and flow.

---

### LV-3 (P1, S): Remove dead/unused telemetry calc branches

Files involved:
- `frontend/app/organizations/[orgId]/projects/[projectId]/live-view/page.tsx`

Checklist:
- [x] Remove unused locals (`avgLatency`) and stale TODO comments.
- [ ] Ensure telemetry stats either:
  - come from real fields, or
  - hide metric cards that are placeholders.

Acceptance criteria:
- [ ] No placeholder metric card claims unsupported values.

---

## 3) Test Lab Cleanup

### TL-1 (P0, S): Fix TODO toolbar handlers that ignore props

Files involved:
- `frontend/components/test-lab/TestLabToolbar.tsx`
- `frontend/app/organizations/[orgId]/projects/[projectId]/test-lab/page.tsx`

Checklist:
- [x] Replace TODO lambdas with actual prop handlers:
  - `onAddRedTeam`
  - `onAddPrivacyScan`
  - `onAddCompliance`
- [ ] Verify buttons create nodes as expected.
- [x] If not ready to support a node type, disable button explicitly with tooltip.

Acceptance criteria:
- [x] No clickable action silently does nothing.

---

### TL-2 (P0, M): Replace fake inspector simulation with real run artifacts

Files involved:
- `frontend/components/test-lab/TestLabInspector.tsx`
- `frontend/components/test-lab/ExecutionLogPanel.tsx`
- `frontend/app/organizations/[orgId]/projects/[projectId]/test-lab/page.tsx`

Checklist:
- [x] Remove or hide `runSimulation()` fabricated logs from default path.
- [ ] Feed panel from backend result data when run exists:
  - `testLabAPI.listResults(run_id=...)`
  - show real step order/status/latency.
- [x] Keep "demo mode" only behind explicit dev flag if needed.

Acceptance criteria:
- [x] Inspector no longer implies fake execution in production path.
- [ ] Any execution log shown corresponds to stored `TestResult` rows.

---

### TL-3 (P1, M): Reduce node surface to wedge-minimal set

Files involved:
- `frontend/app/organizations/[orgId]/projects/[projectId]/test-lab/page.tsx`
- `frontend/components/test-lab/TestLabToolbar.tsx`
- Node components under `frontend/components/test-lab/nodes/*`

Checklist:
- [ ] Define "MVP execution nodes":
  - `inputNode`, `agentCard`, `toolNode`, `evalNode`, `routerNode`, `approvalNode`
- [ ] Hide/flag advanced nodes not needed for current validation wedge.
- [ ] Keep advanced nodes behind "Labs/Experimental" toggle if retained.

Acceptance criteria:
- [ ] First-time user can build and validate a run with <= 6 node types visible.
- [ ] No unsupported node appears as first-class default option.

---

### TL-4 (P1, S): Ensure run identity metadata is always present

Files involved:
- `backend/app/api/v1/endpoints/test_lab.py`
- `frontend/lib/api.ts`
- Test Lab run creation UX entry points

Checklist:
- [ ] Ensure `version_tag` is optional but consistently passed from UI when available.
- [ ] Include run name conventions for rerun lineage (`Rerun of <run>`).
- [ ] Ensure run response always includes `status`, `agent_config`.

Acceptance criteria:
- [ ] Behavior report can consistently display run identity/version context.

---

## 4) Behavior Hub Hardening

### BH-1 (P0, S): Keep report list as operational center

Files involved:
- `frontend/app/organizations/[orgId]/projects/[projectId]/behavior/page.tsx`

Checklist:
- [x] Keep current filter (`all/pass/fail`) and runtime/meta fields.
- [x] Add explicit quick actions per report:
  - "Open related run" (if `test_run_id`)
  - "Open trace context" (if `trace_id`)
- [x] Keep `Rerun` button where `canvas_id` exists.

Acceptance criteria:
- [x] Report list is enough to triage without opening unrelated pages.

---

### BH-2 (P1, M): Introduce minimal rule editing (no visual builder)

Files involved:
- `frontend/app/organizations/[orgId]/projects/[projectId]/behavior/page.tsx`
- `frontend/lib/api.ts`
- `backend/app/api/v1/endpoints/behavior.py`

Checklist:
- [ ] Replace "Save Rule (Coming soon)" with actual JSON submit.
- [ ] Validate JSON shape client-side for known rule types.
- [ ] Support update and enable/disable from same page.

Acceptance criteria:
- [ ] User can create/edit/toggle one rule without leaving Behavior page.

---

### BH-3 (P1, S): Add pagination/sort controls for reports

Files involved:
- `frontend/app/organizations/[orgId]/projects/[projectId]/behavior/page.tsx`
- `frontend/lib/api.ts`

Checklist:
- [ ] Add `limit`, `offset`, `next/prev` controls.
- [ ] Add sort selector (newest first default).

Acceptance criteria:
- [ ] Behavior page remains usable with 100+ reports.

---

## 5) Backend Contract and Data Integrity

### BE-1 (P0, S): Lock report response shape for UI

Files involved:
- `backend/app/api/v1/endpoints/behavior.py`

Checklist:
- [ ] Ensure `summary.runtime` always exists (with null-safe fields).
- [ ] Ensure `summary.target` always exists.
- [ ] Ensure `summary.run_meta` exists for run-based validation.
- [ ] Ensure each violation has `rule_id`, `step_ref`, `evidence`, `human_hint`.

Acceptance criteria:
- [ ] Frontend renders report cards without undefined-branch crashes.

---

### BE-2 (P1, M): Add compare endpoint baseline path (minimal)

Files involved:
- `backend/app/api/v1/endpoints/behavior.py`

Checklist:
- [ ] Add minimal compare route:
  - input: baseline report/run + candidate report/run
  - output: `violation_delta`, `severity_delta`, `first_regressed_step`
- [ ] Keep as JSON only; no heavy visualization required yet.

Acceptance criteria:
- [ ] PM/user can answer "better or worse than baseline?" in one API call.

---

### BE-3 (P1, M): Introduce report export API (JSON first)

Files involved:
- `backend/app/api/v1/endpoints/behavior.py`
- `frontend/lib/api.ts`

Checklist:
- [ ] Add `GET /behavior/reports/{id}/export?format=json`.
- [ ] Export includes summary + violations + context.
- [ ] Add button in Behavior report card to trigger export.

Acceptance criteria:
- [ ] One-click report sharing for audits works.

---

## 6) Remove/Defer Inventory (explicit)

### Remove now (default user path)
- [x] `TriageDashboard` usage in live page.
- [x] `LiveGraphView` and modal path from default live workflow.
- [x] Fake inspector simulation trigger in production UI.

### Defer behind experimental toggle
- [x] `SafetyCertificate` polished certificate UX.
- [ ] Full advanced node palette in Test Lab.
- [ ] Sentinel/Ghost visual complexity in Live View beyond core incident triage.

### Keep as strategic core
- [x] `Validate` buttons in Live View/Test Lab.
- [x] Behavior report filters + runtime + step context.
- [x] Rerun from report.

---

## 7) QA Checklist (must pass before merge)

### Functional loop
- [ ] Live View: select agent -> validate trace -> report appears in Behavior.
- [ ] Test Lab: run test -> validate run -> report appears in Behavior.
- [ ] Behavior: filter pass/fail works and counts are correct.
- [ ] Behavior: rerun creates new Test Lab run when `canvas_id` exists.

### Data consistency
- [ ] Report `target.type` matches invocation (`trace` vs `test_run`).
- [ ] Runtime fields are null-safe when unavailable.
- [ ] Step context is attached to at least first violation when step exists.

### UX clarity
- [ ] No disabled button with "Coming soon" in the primary validation flow.
- [ ] No fake/random data displayed as if real in primary pages.

---

## 8) Delivery Plan (solo-friendly)

### Phase A (1-2 days)
- [x] LV-1, TL-1, TL-2
- [ ] QA functional loop

### Phase B (1-2 days)
- [ ] TL-3, BH-1, BH-2
- [ ] QA data consistency

### Phase C (optional, 1 day)
- [ ] BH-3, BE-3
- [ ] polish and docs

---

## 9) Done Definition

This cleanup is complete only when:
- [ ] A new user can run the end-to-end wedge loop in under 10 minutes.
- [ ] There is exactly one clear path for incident-to-validation in each page.
- [ ] Primary views show only backend-truth data (no synthetic/confusing simulation).
- [ ] Report output is actionable enough to fix and rerun without guessing.

