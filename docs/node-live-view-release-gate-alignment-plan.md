# Node-Level Live View / Release Gate Alignment Plan

Last updated: 2026-03-22

## Goal

Keep the current product structure, but make the product story and UI much clearer:

- `Live View` = monitor real production calls for one node
- `Release Gate` = replay and compare production snapshots for one node

We are not trying to simulate an entire multi-agent workflow end-to-end. We are making node-level debugging and node-level regression testing much easier.

## Why this direction

- Complex conversational systems always have context, privacy, and payload-shape limits.
- Other observability products also handle this by grouping calls into traces/sessions/spans and improving visibility, not by guaranteeing perfect full-workflow replay.
- Our differentiation is stronger at the node level:
  - identify which node changed
  - inspect what that node actually received
  - inspect tool behavior and side effects for that node
  - replay production snapshots for that node before shipping

## Current state analysis

### Backend

- `Snapshot` already stores node-level request/response data: `payload`, `system_prompt`, `user_message`, `response`, `model`, `model_settings`, `trace_id`, `agent_id`.
- `snapshot_service.py` already extracts prompt fields from common request shapes, especially `messages`.
- `live_view.py` already returns:
  - `provider`
  - `model`
  - `model_settings`
  - `tool_calls_summary`
  - `has_tool_results`
  - `request_context_meta`
- `release_gate.py` already supports node-level replay controls:
  - model override
  - provider override
  - system prompt override
  - sampling overrides
  - `replay_overrides`
  - `replay_overrides_by_snapshot_id`
  - `tool_context`

### Frontend

- `SnapshotDetailModal` already shows:
  - request context
  - tool activity
  - custom code
  - agent response
  - evaluation
  - execution steps
- `RequestContextPanel` already supports:
  - `messages[]` view
  - legacy `system_prompt` / `user_message`
  - heuristic extended context keys (`context`, `documents`, `attachments`, etc.)
- `ReleaseGateConfigPanel` already supports:
  - baseline reference
  - config-only JSON
  - additional request fields
  - additional system context
  - thresholds
- `ReleaseGateReplayRequestMetaPanel` already shows:
  - applied request body overrides
  - per-log overrides
  - sampling overrides
  - system prompt override preview

## Main product gaps

### Gap 1: Live View does not clearly summarize replay-relevant request shape

The detail view shows rich content, but it does not give a compact answer to:

- what model/provider ran?
- how many messages were sent?
- were tools defined?
- were non-message request fields present?
- was request content omitted or truncated?

### Gap 2: Release Gate settings do not clearly tell users what must match baseline

Users can already edit many replay controls, but the UI is still weak at:

- showing the baseline request shape clearly
- warning when replay-critical request fields may be missing
- helping users understand parity between baseline and candidate

### Gap 3: Release Gate results do not summarize run configuration strongly enough

The result panel already exposes replay metadata, but it should first answer:

- what was changed for this run?
- were sampling overrides applied?
- were request body overrides applied?
- was additional system context used?
- what thresholds and repeat count were used?

## Today’s implementation scope

We will not redesign the product or introduce trace-level replay.

We will implement the following:

1. Add a reusable node request overview helper on the frontend.
2. Add a node request overview section to Live View snapshot detail.
3. Add baseline request summary and parity hints to Release Gate settings.
4. Add run configuration summary to Release Gate results.
5. Verify with TypeScript and lint checks.

## Detailed implementation plan

### Phase 1: Shared request overview helper

Add a small frontend helper that derives replay-relevant request facts from a captured payload:

- request message count
- tools count
- provider / model
- sampling knobs
- extended-context keys
- additional request keys
- omitted / truncated flags

Target files:

- `frontend/lib/requestOverview.ts` (new)

### Phase 2: Live View snapshot detail

Add a `Node Request Overview` section to the snapshot detail modal.

Show:

- provider
- model
- messages count
- tools count
- request state (`complete`, `omitted`, `truncated`)
- sampling knobs
- extended context keys
- additional request keys

Target files:

- `frontend/components/shared/SnapshotDetailModal.tsx`
- `frontend/components/live-view/RequestContextPanel.tsx` (only if supporting helper usage is needed)

### Phase 3: Release Gate settings

Add a compact baseline request summary and candidate parity hints.

Show:

- baseline request overview
- candidate request overview
- warnings when:
  - baseline request was omitted or truncated
  - baseline had tools but candidate removed them
  - baseline had extended or additional request keys that candidate no longer includes

Target files:

- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateConfigPanel.tsx`
- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePageContent.tsx`

### Phase 4: Release Gate results

Add a compact `Run config summary` block above the deeper replay metadata.

Show:

- repeat runs
- fail / flaky thresholds
- sampling override presence
- system prompt override presence
- request body override key count
- per-log override count
- additional system context mode

Target files:

- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateExpandedView.tsx`
- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateReplayRequestMetaPanel.tsx` (reuse existing details; no major redesign required)

## Explicit non-goals for today

- No trace-level or workflow-level replay redesign
- No new backend replay contract
- No cross-node orchestration UI
- No SDK ingest contract changes
- No major copy rewrite beyond what is required for clarity

## Success criteria

### Live View

- A user can open a snapshot and answer “what did this node receive?” in under 10 seconds.

### Release Gate settings

- A user can answer “what from baseline am I preserving or losing?” before pressing Run.

### Release Gate results

- A user can answer “what changed in this experiment?” before reading the per-input breakdown.

## Validation plan

Run manual checks for:

1. Simple request with only messages.
2. Request with tools.
3. Request with extended context keys such as `attachments` or `documents`.
4. Request with omitted or truncated request content markers.
5. Release Gate run with:
   - model-only change
   - sampling-only change
   - request body overrides
   - additional system context

## Follow-up backlog

Once today’s work is stable, the next useful additions are:

- backend-derived request overview fields for stronger consistency
- “replay readiness” status per snapshot
- easier baseline-to-candidate parity suggestions
- better node-to-trace navigation for complex workflows
