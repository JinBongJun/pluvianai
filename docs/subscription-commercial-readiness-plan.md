# Subscription Commercial Readiness Plan

## Why This Document Exists

This document is the conservative, production-facing plan for making subscriptions, quota enforcement, billing UX, and customer trust flows safe enough for paid usage.

This is not only about making Paddle checkout work.
This is about making sure:

- paid customers always get the limits they purchased
- free users cannot exceed paid-only quotas
- Live View and Release Gate behave predictably at quota boundaries
- UI badges and upgrade prompts never contradict backend enforcement
- billing, cancellation, and refund expectations are clear before money is taken
- support and ops can diagnose billing issues quickly

If any part of this chain is inconsistent, the product is not commercially safe.

## Non-Negotiable Principles

1. There must be exactly one source of truth for subscription plan and entitlements.
2. Every quota decision must be enforced on the server.
3. Every quota-limited UI action should be proactively disabled in the frontend when the limit is already reached.
4. Every limit error must return a structured payload with enough data for the UI and for support.
5. Billing state changes must be observable, auditable, and reversible where appropriate.
6. Legal and policy disclosures must be visible before purchase and easy to find after purchase.
7. Downgrades, cancellations, and partial failures must be handled more conservatively than upgrades.

## Current State Summary

### What Works Today

- Paddle checkout session creation exists and can open the hosted checkout/modal flow.
- `_ptxn` / `ptxn` payment-link return flow is handled in the frontend.
- cancel flow now returns users to billing.
- account billing and org billing pages exist.
- refund page already exists at `/refund`.
- backend webhook handling, retry, DLQ, and reconciliation already exist.
- project limit checks appear to use the account subscription path correctly.
- Release Gate and Live View have server-side limit enforcement paths.

### What Is Not Safe Yet

- organization limits and org plan badges are inconsistent with the purchased plan
- quota enforcement logic is split across multiple backend sources
- Live View and Release Gate mostly rely on backend rejection after the user clicks, instead of proactively disabling actions
- limit errors are not normalized across all quota types
- some UI plan labels still derive from `Organization.plan_type`, which is effectively stale/legacy data
- policy/legal pages exist, but commercial readiness still needs a stricter checklist

## Confirmed Findings From Current Code

### 1. Organization creation can incorrectly fall back to free-plan limit

`SubscriptionService.get_user_plan()` does not include `organizations` in the returned `limits` object.

`check_organization_limit()` reads `plan_info["limits"].get("organizations", 1)`.

Result:

- a paid user can still be evaluated as `1` org max
- this matches the observed `Organization limit reached: 1 / 1` behavior

Relevant files:

- `backend/app/services/subscription_service.py`
- `backend/app/middleware/usage_middleware.py`
- `backend/app/api/v1/endpoints/organizations.py`

### 2. Organization list and header badges use stale org-level plan data

Organizations are still serialized with `org.plan_type`.
The frontend normalizes and renders this as the org badge.

Result:

- account is paid
- org card/header still says `Free Plan`

Relevant files:

- `backend/app/api/v1/endpoints/organizations.py`
- `frontend/lib/api/organizations.ts`
- `frontend/app/organizations/page.tsx`
- `frontend/components/layout/TopHeader.tsx`

### 3. Entitlement resolution is fragmented

Today there are multiple plan/limit resolution paths:

- `SubscriptionService.get_user_plan()`
- `backend/app/core/usage_limits.py`
- `BillingService.increment_usage()`
- `Organization.plan_type` as UI display data

This is a structural risk.

It allows situations like:

- org limit behaves as free
- project limit behaves as starter
- Live View behaves according to another resolver
- Release Gate behaves according to another resolver

### 4. Release Gate is server-enforced but not fully proactively disabled

Release Gate already blocks hosted runs when replay credits are exhausted.
However, the user can still click Run first and discover the issue only after the backend rejects the request.

Current state:

- backend guard exists
- frontend banner exists after failure
- pre-emptive button disable is not yet the primary behavior

Relevant files:

- `backend/app/api/v1/endpoints/release_gate.py`
- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/useReleaseGateValidateRun.ts`
- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/useReleaseGatePageModel.ts`

### 5. Live View is server-enforced but not fully proactively disabled

Live View snapshot writes are blocked server-side when the monthly snapshot limit is reached.
The frontend can show the banner after it receives the error, but it is not yet a complete proactive guard.

Important nuance:

- some Live View traffic originates from deployed agents / SDK ingestion, not from a browser button
- therefore, true protection must always remain server-side
- but the browser UI should still surface quota state before the user tries actions that depend on fresh snapshots

Relevant files:

- `backend/app/api/v1/endpoints/live_view.py`
- `backend/app/core/usage_limits.py`
- `frontend/components/live-view/ClinicalLog.tsx`

### 6. Limit error payloads are inconsistent

Good examples:

- `ORG_LIMIT_REACHED`
- `PROJECT_LIMIT_REACHED`

These already return:

- `plan_type`
- `current`
- `limit`
- `upgrade_path`

Weaker examples:

- `SNAPSHOT_PLAN_LIMIT_REACHED`
- `LIMIT_PLATFORM_REPLAY_CREDITS`

These do not yet consistently expose:

- exact plan type used
- current usage
- numeric limit
- reset timing

This weakens UI quality and support debugging.

### 7. Refund page exists, but commercial/legal completeness still needs review

Current page:

- `frontend/app/refund/page.tsx`

What it already covers:

- recurring billing
- cancellation timing
- non-refundable default stance
- support contact path

What still needs review before calling the legal/commercial surface complete:

- explicit invoice/contact mailbox or support route
- duplicate charge handling
- jurisdictional caveat for statutory consumer rights
- subscription cancellation discovery and invoice access inside product
- consistency between checkout copy, footer links, and policy wording

## Desired Target Architecture

## 1. Canonical Entitlements Model

Create one canonical backend contract for paid state and quotas.

Suggested shape:

```json
{
  "plan_type": "starter",
  "status": "active",
  "billing_source": "paddle",
  "current_period_end": "2026-04-27T00:00:00Z",
  "reset_at": "2026-05-01T00:00:00Z",
  "limits": {
    "organizations": 3,
    "projects": 8,
    "snapshots_per_month": 50000,
    "platform_replay_credits_per_month": 600
  },
  "usage_this_month": {
    "organizations_used": 1,
    "projects_used": 3,
    "snapshots": 4210,
    "platform_replay_credits": 27
  },
  "remaining": {
    "organizations": 2,
    "projects": 5,
    "snapshots": 45790,
    "platform_replay_credits": 573
  }
}
```

This shape should drive:

- billing page
- organizations list/new org page
- projects list/new project page
- Live View quota warnings
- Release Gate quota gating
- support/admin diagnostics

## 2. One Backend Resolver, Many Callers

All quota checks should ultimately read from one resolver.

Recommended rule:

- `SubscriptionService.get_user_plan()` (or a renamed `EntitlementService`) becomes canonical
- `usage_limits.py` becomes a thin helper that delegates to the canonical resolver
- `BillingService.increment_usage()` should not invent a separate plan-resolution path

## 3. Three-Layer Enforcement

Every quota-limited feature should use all three layers:

1. UI state
2. API preflight / request validation
3. backend hard enforcement

If layer 1 fails, layer 2 protects.
If layer 2 fails, layer 3 protects.

## 4. Structured Limit Errors Everywhere

All limit errors should normalize to:

```json
{
  "code": "LIMIT_PLATFORM_REPLAY_CREDITS",
  "message": "Hosted replay credits are exhausted for this billing period.",
  "details": {
    "plan_type": "starter",
    "metric": "platform_replay_credits",
    "current": 600,
    "limit": 600,
    "remaining": 0,
    "reset_at": "2026-05-01T00:00:00Z",
    "upgrade_path": "/settings/billing",
    "suggested_action": "use_byok_or_upgrade"
  }
}
```

This must apply to:

- organizations
- projects
- team members
- snapshots
- hosted replay credits
- any future paid feature

## Product Improvement Plan

## Phase 0: Immediate Commercial Safety Fixes

Goal:

- fix known subscription inconsistencies before further monetization work

Scope:

1. Add `organizations` to `SubscriptionService.get_user_plan().limits`
2. stop using `Organization.plan_type` as the displayed plan badge for org list/header
3. ensure org creation limit uses the same entitlement source as project creation
4. verify `auth/me/usage.plan_type` and org/project limit paths agree in all cases

Files likely involved:

- `backend/app/services/subscription_service.py`
- `backend/app/middleware/usage_middleware.py`
- `backend/app/api/v1/endpoints/organizations.py`
- `frontend/lib/api/organizations.ts`
- `frontend/app/organizations/page.tsx`
- `frontend/components/layout/TopHeader.tsx`

Acceptance criteria:

- paid sandbox account can create up to purchased org count
- organizations page does not show `Free Plan` when account plan is `starter/pro`
- org header badge matches account billing badge

## Phase 1: Entitlement Unification

Goal:

- make plan/limit decisions deterministic everywhere

Scope:

1. introduce a single entitlements/usage contract used by all quota-aware frontend screens
2. refactor `usage_limits.py` and any ad hoc limit readers to delegate to the canonical resolver
3. remove or de-emphasize `Organization.plan_type` from quota/plan display logic
4. add reset date and remaining counts to the shared contract

Files likely involved:

- `backend/app/services/subscription_service.py`
- `backend/app/core/usage_limits.py`
- `backend/app/services/billing_service.py`
- `backend/app/api/v1/endpoints/auth.py`
- frontend consumers of `/auth/me/usage`

Acceptance criteria:

- org, project, Live View, Release Gate, and billing pages all read the same plan state
- no route derives paid state from legacy org fields
- no route uses a hidden fallback that silently converts a paid user into free

## Phase 2: Proactive UI Gating

Goal:

- users should understand they are at a limit before pressing the action

### Organizations

- disable `New Organization` button when `organizations_used >= organizations limit`
- show usage summary next to or under the button
- keep direct URL access guarded too (`/organizations/new`)

### Projects

- disable `New Project` button when limit reached
- keep direct route access guarded too

### Release Gate

- if hosted replay credits remaining is `0`, disable hosted Run button
- if BYOK is available, surface `Run with BYOK` as the primary alternative
- keep backend rejection intact

### Live View

Important nuance:

- browser UI can be proactively gated for UI actions
- deployed SDK traffic cannot be fully prevented from the frontend because it originates outside the browser

Therefore:

- Live View UI should clearly show `snapshot quota exhausted`
- actions that rely on fresh hosted captures should be disabled or marked degraded
- backend must continue rejecting/stopping writes

Files likely involved:

- `frontend/app/organizations/page.tsx`
- `frontend/app/organizations/new/page.tsx`
- `frontend/app/organizations/[orgId]/projects/page.tsx`
- `frontend/app/organizations/[orgId]/projects/new/page.tsx`
- `frontend/components/live-view/ClinicalLog.tsx`
- Release Gate page model/components under `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/`

Acceptance criteria:

- UI shows remaining quota before click
- actions disable before request when limit is known
- backend still blocks direct requests when UI state is stale

## Phase 3: Limit Error Normalization

Goal:

- all quota failures feel consistent and are easy to debug

Scope:

Normalize all 403 plan-limit responses to include:

- `code`
- `message`
- `details.plan_type`
- `details.metric`
- `details.current`
- `details.limit`
- `details.remaining`
- `details.reset_at`
- `details.upgrade_path`

Applies to:

- org create
- project create
- team invite/add
- Live View snapshot ingest and save
- Release Gate hosted replay run
- any future paid actions

Acceptance criteria:

- one frontend parser can display all quota failures consistently
- support can diagnose from a single API payload

## Phase 4: Billing State Freshness and Consistency

Goal:

- after payment success, all quota-aware surfaces should converge quickly

Scope:

1. confirm webhook updates subscription row reliably
2. ensure billing page, org list, org detail, project creation, Live View, Release Gate all revalidate after successful payment
3. keep reconciliation endpoint/job for missed webhooks
4. add support/admin visibility for current effective plan

Acceptance criteria:

- after successful sandbox/live checkout, plan changes are visible without confusing partial states
- stale `Free Plan` labels do not persist after a paid upgrade

## Phase 5: Commercial and Policy Surface Completion

Goal:

- meet expected SaaS billing clarity and legal discoverability

### Current status

- `/refund` exists
- billing page links `Terms`, `Privacy`, and `Refund/Cancellation`

### Recommended improvements

1. Review and harden the refund policy wording
2. Make cancellation path explicit in-app
3. Add invoice/billing history access if/when Paddle customer portal or invoice linking is available
4. Make billing support contact explicit and durable
5. Ensure all public pricing and billing copy matches actual enforcement

### Refund page specific improvements

The page exists today, but should be reviewed for:

- "how to request a refund"
- "how duplicate/incorrect charges are handled"
- "when cancellation takes effect"
- "what happens to access after cancellation"
- "applicable law caveat"
- "support contact channel"
- "timeframe for billing support response" if the business wants to commit to one

Potential future additions:

- invoice help page
- billing support SLA page
- enterprise procurement/contact page with response expectation

## Detailed Implementation Plan

## Workstream A: Fix the Data Model and Resolver

1. Expand the canonical limits payload to include all quota-relevant fields:
   - organizations
   - projects
   - snapshots
   - platform replay credits
   - team members
   - retention days
2. Ensure every backend limit check consumes the canonical limits payload.
3. Remove silent fallbacks like `.get("organizations", 1)` where a missing key hides a bug.
4. Add invariant assertions or tests so canonical payload omissions fail loudly.

Risks:

- changing the payload can break frontend assumptions
- hidden old code paths may still bypass the canonical resolver

Mitigation:

- add unit tests for returned entitlement schema
- add integration tests for every quota-consuming route

## Workstream B: Fix UI Plan Display

1. Distinguish between:
   - org metadata
   - account subscription plan
2. Use account subscription plan for commercial plan badge display.
3. Keep org-level metadata only for legacy/back-compat fields, not for paid status messaging.

Risks:

- users in multi-org scenarios may expect org-level billing, but current product is account-scoped

Mitigation:

- explicitly label quotas as account plan limits in org screens
- avoid ambiguous wording like `org plan` unless org-billing truly exists

## Workstream C: Add Proactive Gating

1. Add reusable entitlement selectors in frontend.
2. Compute `remaining` for all limitable actions.
3. Disable buttons/routes when remaining is zero.
4. Always retain backend enforcement.

Special note for Live View:

- because ingest can happen outside the browser, "disable the UI" is not the full answer
- the backend must keep dropping/rejecting over-limit data
- the UI should explain that new logs are not being stored due to quota exhaustion

## Workstream D: Normalize Errors and Messaging

1. Introduce a shared backend helper for plan-limit 403 responses.
2. Replace ad hoc detail payloads with the helper.
3. Upgrade frontend plan error parsing to display:
   - plan
   - used / limit
   - reset date
   - CTA

## Workstream E: Improve Billing and Policy Surface

1. Keep `/refund` but tighten wording after legal review.
2. Add explicit cancellation/invoice/help entry points in billing UI.
3. Review footer, pricing, billing page, and checkout text for consistency.
4. If Paddle exposes customer portal/invoice deep links later, integrate them.

## Test Strategy

This section is intentionally conservative.
Anything touching paid limits should be tested at four layers:

- unit
- integration/API
- UI/e2e
- sandbox manual validation

## Unit Tests

### Subscription / Entitlement unit tests

- `free` plan returns organizations=1, projects=2, snapshots=10000, replay credits=60
- `starter` returns organizations=3, projects=8, snapshots=50000, replay credits=600
- `pro` returns organizations=10, projects=30, snapshots=200000, replay credits=3000
- `enterprise` returns unlimited where expected
- legacy `indie/startup` normalize to `starter`
- missing subscription row returns free safely
- malformed subscription plan normalizes safely

### Limit resolver tests

- org limit check reads canonical `organizations`
- project limit check reads canonical `projects`
- snapshot check reads canonical `snapshots_per_month`
- replay credit check reads canonical `platform_replay_credits_per_month`
- no resolver uses stale org metadata

### Structured error tests

- org limit error contains plan/current/limit/upgrade_path
- project limit error contains plan/current/limit/upgrade_path
- snapshot limit error contains plan/current/limit/remaining/reset_at
- replay credit error contains plan/current/limit/remaining/reset_at

## Integration/API Tests

### Billing lifecycle

- checkout session creation for starter
- checkout session creation for pro
- invalid plan rejected
- webhook `transaction.completed` updates subscription
- webhook `subscription.created` updates subscription
- webhook `subscription.updated` updates subscription
- webhook `subscription.canceled` returns user to free
- reconciliation repairs mismatched subscription rows

### Org / Project limits

- free user:
  - org 1 allowed, 2nd blocked
  - projects 2 allowed, 3rd blocked
- starter user:
  - orgs 3 allowed, 4th blocked
  - projects 8 allowed, 9th blocked
- pro user:
  - orgs 10 allowed, 11th blocked
  - projects 30 allowed, 31st blocked

### Live View limits

- free user can create snapshots up to cap
- next snapshot is rejected with structured 403
- starter user receives higher cap
- over-limit SDK/background ingestion is dropped or rejected consistently
- usage counters reflect successful writes only

### Release Gate limits

- hosted replay with credits remaining succeeds
- hosted replay at cap returns structured 403
- BYOK replay still allowed when hosted replay credits are exhausted
- rate limit errors remain distinct from plan limit errors

## Frontend / E2E Tests

### Billing

- billing page shows correct current plan after subscription upgrade
- cancel returns to billing page
- success returns to billing page and refreshes state
- refresh on `/checkout?ptxn=...` reopens checkout instead of dead-ending

### Organizations

- org list badge reflects account subscription
- new org button disabled when at limit
- direct visit to `/organizations/new` still shows limit banner
- upgrade CTA goes to `/settings/billing`

### Projects

- new project button disabled when at limit
- direct visit to `/projects/new` still shows limit banner

### Live View

- when snapshot limit reached:
  - banner appears
  - affected UI actions are disabled or clearly degraded
  - messaging explains upgrade vs wait-for-reset

### Release Gate

- when hosted replay credits are exhausted:
  - hosted Run is disabled
  - BYOK option remains available
  - explanatory text appears before click

## Sandbox Manual Validation

### Upgrade flow

1. start on free
2. open sandbox checkout
3. cancel from modal
4. confirm return to billing page with cancel handling
5. repeat and complete sandbox payment
6. confirm webhook delivery 200
7. confirm subscription row updated
8. confirm `auth/me/usage` shows paid plan
9. confirm billing page updates
10. confirm org/project/live view/release gate all see same plan

### Downgrade / cancellation flow

1. start on starter/pro
2. simulate cancellation webhook
3. confirm subscription row becomes free/cancelled
4. confirm paid-only entitlements are removed correctly
5. confirm existing org/project data remains accessible according to product policy

### Failure injection

- wrong webhook secret
- wrong sandbox/live price ids
- missing customer mapping
- stale frontend cache after successful payment
- partially failed webhook followed by reconcile

## What The Agent Should Explicitly Test During Implementation

When implementing this plan, the agent should test at minimum:

1. unit tests for entitlement payload completeness
2. unit tests for org/project/snapshot/replay limit resolvers
3. integration tests for paid plan org/project counts
4. integration tests for webhook-driven subscription updates
5. frontend type-check after every substantial change
6. targeted frontend tests for billing and limit UI behavior
7. sandbox manual validation for success and cancel checkout paths
8. manual verification of:
   - org list badge
   - new org button state
   - new project button state
   - Live View plan banner
   - Release Gate run button gating

## Rollout Strategy

### Step 1: Fix entitlements and org bugs first

Do not start with cosmetic UI.
First fix the plan data source and org limit bug.

### Step 2: Normalize all limit errors

Before proactive disable, make sure backend responses are complete and consistent.

### Step 3: Ship proactive frontend gating

Only after backend truth is stable should frontend buttons rely on it.

### Step 4: Re-run sandbox subscription lifecycle

Upgrade, cancel, refresh, stale cache, webhook repair.

### Step 5: Review all public-facing billing/policy text

Pricing page, billing page, footer, terms, privacy, refund.

## Launch Gate Checklist

Do not call subscriptions commercially ready until all items below are true.

- [ ] account billing plan matches backend subscription row
- [ ] org list/header badge matches account billing plan
- [ ] org limit matches purchased plan
- [ ] project limit matches purchased plan
- [ ] Live View snapshot limit matches purchased plan
- [ ] Release Gate hosted replay credit limit matches purchased plan
- [ ] frontend pre-disables quota-exhausted actions where practical
- [ ] backend still hard-blocks direct over-limit requests
- [ ] all limit errors return structured metadata
- [ ] sandbox upgrade flow tested end-to-end
- [ ] sandbox cancel flow tested end-to-end
- [ ] webhook retry / reconcile tested
- [ ] refund/cancellation policy reviewed and linked
- [ ] support path for billing issues is visible

## Recommended Follow-Up Documents

After the implementation work begins, create or update:

- `docs/billing-hardening-runbook.md`
  - keep as the operations runbook
- a dedicated entitlement contract doc
  - request/response examples
  - limit error schema
- a billing support playbook
  - how to diagnose mismatch, refund requests, duplicate charges, failed webhooks

## Final Recommendation

Treat this work as a revenue integrity project, not a UI polish task.

The correct order is:

1. unify subscription truth
2. fix org/project/live/replay enforcement consistency
3. normalize all limit responses
4. add proactive gating
5. tighten policy/support surface

The currently observed org mismatch is strong evidence that the codebase is close, but not yet consistent enough to trust with every paid edge case.
