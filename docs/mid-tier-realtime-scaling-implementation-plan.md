# Mid-Tier Realtime Scaling Implementation Plan

## Goal

Move AgentGuard from an early-stage polling-heavy realtime architecture to a more standard mid-tier SaaS design:

- `Release Gate` status updates should be `SSE-first`, not poll-first.
- `Live View` should stay `SSE-first`, with polling only as a controlled fallback.
- Hot read paths should be served from short-lived cache before they hit the database repeatedly.
- Background jobs should publish lightweight state changes that browsers can subscribe to.
- Rate limiting should become a last-resort safety net, not the primary flow-control mechanism for normal usage.

This plan is intentionally aligned with common industry patterns used by products that expose live job progress, dashboards, and activity feeds.

Companion docs:

- `docs/live-view-rg-polling-inventory.md`
- `docs/mvp-realtime-pipeline-implementation-plan.md`
- `docs/rate-limit-heavy-endpoints-design.md`

## Current State

What is already good:

- Live View already has an SSE endpoint and uses polling fallback.
- Release Gate async runs already execute through a background job model.
- Hot paths already have some Redis-backed cache and per-user rate-limit buckets.
- Release Gate job polling has already been improved with slower polling, jitter, and a short-lived poll cache.

What still keeps the system below a more typical mid-tier SaaS level:

1. `Release Gate` status is still fundamentally poll-driven in the browser.
2. Repeated viewers of the same job still generate redundant reads under sustained load.
3. Realtime event publication is inconsistent across hot paths.
4. Payloads and cache contracts are not yet intentionally split into `list/status/detail`.
5. Connection-level controls exist for Live View SSE, but not yet as a unified pattern for all realtime features.

## Target Architecture

### 1. Realtime Transport

Adopt `SSE-first, polling-fallback` for browser job/status experiences.

Why this is the common choice:

- Much simpler than WebSocket for server-to-browser status updates.
- Works well with HTTP infrastructure and reverse proxies.
- Easy to keep stateless on the API side when paired with Redis pub/sub.
- Good fit for Release Gate, where the browser mostly needs one-way job updates.

Target usage:

- `Live View`: SSE for agent-list invalidation and lightweight refresh triggers.
- `Release Gate`: SSE for job lifecycle events (`queued`, `running`, `cancel_requested`, `succeeded`, `failed`, `canceled`).
- Polling remains only as:
  - a reconnect fallback,
  - an event-loss safety net,
  - a compatibility path when Redis/SSE is degraded.

### 2. Hot-Path Read Model

Split hot reads into three categories:

1. `status`
   - Tiny payload
   - Frequently updated
   - Safe to serve from 1-5 second cache
2. `list`
   - Dashboard cards / agent rows / job summaries
   - Cacheable for 5-30 seconds depending on freshness needs
3. `detail`
   - Large result payloads
   - Fetched explicitly on demand or once at terminal state

Release Gate target:

- `GET /release-gate/jobs/{job_id}` becomes a tiny status endpoint for the common path.
- Final detailed result is fetched once when the job reaches a terminal state.

### 3. Event Publication

Use Redis pub/sub for lightweight fan-out notifications:

- each project or job gets a channel,
- workers publish state transitions,
- API stream endpoints subscribe and forward to browsers,
- browsers mutate local state or do one final fetch for details.

This is the standard stepping stone before more advanced event infrastructure.

### 4. Limits and Backpressure

Use layered protection:

1. Short-lived cache
2. SSE / push updates
3. Client backoff + jitter
4. Connection limits
5. Rate limits

In a healthy mid-tier design, users should normally interact with layers 1-3. Layer 5 should be a rare protection path.

## Implementation Order

### Phase 1. Release Gate status stream

Goal:

- Replace poll-first job tracking with `SSE-first` status updates.

Scope:

- add `GET /projects/{project_id}/release-gate/jobs/{job_id}/stream`
- publish lightweight `job_updated` events from job lifecycle transitions
- keep one slow fallback poll in the frontend for safety
- fetch the final detailed result once at terminal state

Expected impact:

- biggest reduction in `release_gate_job_poll` pressure
- less redundant DB work for the same active job
- lower chance of 429 under multi-user or multi-tab wait screens

Success criteria:

- normal Release Gate run uses SSE as primary update channel
- fallback poll frequency is much lower while SSE is healthy
- repeated waiting viewers no longer need fast polling to stay current

### Phase 2. Live View SSE hardening

Goal:

- make Live View rely even less on polling under normal conditions

Scope:

- reduce unnecessary fallback polling while SSE is connected
- formalize connection caps and reconnect backoff rules
- ensure hot-path invalidation events stay lightweight and debounced
- confirm hidden-tab behavior closes or softens connections consistently

Expected impact:

- lower steady-state dashboard read load
- better multi-tab behavior
- more predictable infra cost

### Phase 3. Hot payload split and cache contracts

Goal:

- separate `status`, `summary`, and `detail` payloads intentionally

Scope:

- audit `Live View` and `Release Gate` endpoints for oversized list/status responses
- introduce explicit thin DTOs for polling/stream-linked reads
- define TTL and invalidation rules per endpoint class

Expected impact:

- lower serialization cost
- lower Redis payload size
- faster p95 and p99 tail latency

### Phase 4. Realtime event contract cleanup

Goal:

- standardize how background jobs and ingest flows notify realtime clients

Scope:

- document channel naming
- normalize event envelope shape
- make cache invalidation and event publication share one contract
- add observability for dropped events / reconnect churn / active stream counts

Expected impact:

- easier operations
- easier future expansion to more realtime surfaces

### Phase 5. Infra scale-up

Goal:

- reach stable mid-tier concurrency rather than patching single endpoints

Scope:

- scale API and worker separately
- confirm Redis sizing and persistence mode
- consider read replica for hot read traffic if DB becomes next bottleneck
- add dashboards for:
  - SSE connection count
  - job poll fallback rate
  - cache hit ratio
  - endpoint p95/p99
  - rate-limit exceed count by bucket

Expected impact:

- safer scaling from tens to hundreds of active heavy users

## Recommended Industry Defaults

These are the common patterns worth following unless a measurement proves otherwise:

1. Prefer `SSE` over WebSocket for one-way job/status updates.
2. Send tiny invalidation or status events, not full heavy result payloads on every update.
3. Fetch full result payload only once at terminal state.
4. Use Redis pub/sub for fan-out and Redis cache for hot reads before introducing more complex brokers.
5. Close or soften realtime connections for hidden tabs.
6. Add jitter to all polling fallbacks.
7. Keep rate limits, but tune the product so normal usage does not live at the limit boundary.

## What We Will Build First

Start with `Phase 1: Release Gate status stream`.

Reason:

- It is the clearest current bottleneck.
- It uses a pattern already proven in this repo through Live View SSE.
- It gives the highest user-facing gain for the smallest architectural diff.

## Rollout Notes

Implement in this order:

1. Backend event publication helper for Release Gate jobs
2. Backend SSE stream endpoint for a single job
3. Frontend `useReleaseGateValidateRun` converted to `SSE-first, poll-fallback`
4. Verification with staged load tests:
   - `10 VU`
   - `20 VU`
   - `30 VU`
5. Update `docs/live-view-rg-polling-inventory.md` with new Release Gate realtime behavior

## Done Definition For This Document

This plan should be considered complete only when:

- Release Gate wait screens are primarily event-driven
- Live View remains SSE-first with controlled fallback
- hot path cache and event rules are documented per endpoint
- load tests show latency becomes the next bottleneck before 429 in normal usage bands
