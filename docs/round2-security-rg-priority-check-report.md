# Round 2 Priority Check Report

Date: 2026-03-13 (local)
Scope order: N (Security/Resilience/Privacy) -> RG-2/RG-3

## 1) N Scenarios (Priority 1)

### N-1 Session/token expiry + re-auth consistency
- Result: **PASS**
- Backend evidence:
  - Invalid/expired token on protected APIs returned consistent `401`:
    - `/projects/{id}/live-view/agents`
    - `/projects/{id}/release-gate/agents`
    - `/organizations/{id}`
- Frontend evidence:
  - After forcing invalid `access_token` + `refresh_token`, protected route access redirected to `/login` or `/login?reauth=1`.
  - Re-auth copy was visible (`Please log in again` / credential verification text).

### N-2 Multi-tenant isolation (cross-org/project access)
- Result: **PASS (with UX latency warning)**
- Backend evidence:
  - User A calling User B tenant resources consistently returned `403` across read/mutation endpoints:
    - org/project read
    - live-view agents
    - release-gate agents
    - release-gate validate async
- Frontend evidence:
  - URL tampering to foreign tenant eventually rendered explicit `Access Denied` panel.
- Warning:
  - Access-denied UI surfaced slowly in headless run (up to ~42s in worst case). Security boundary is correct, but user feedback latency should be improved.

### N-3 Brute-force protection + CAPTCHA gate
- Result: **PASS (after hardening fix)**
- Initial finding:
  - Repeated invalid login attempts returned continuous `401` in local runtime where Redis/CAPTCHA were disabled.
- Hardening implemented:
  - Added Redis-down fail-closed fallback in `backend/app/services/brute_force_protection.py`.
  - Added cooldown-safe lockout window (`blocked_until`) so temporary lockouts expire correctly instead of sticking indefinitely.
  - Added/expanded unit tests in `backend/tests/unit/test_brute_force_protection.py`.
  - Test result: `4 passed`.
- Live verification:
  - Invalid password attempts reached `429` at threshold (`Too many attempts. Try again in 60 seconds.`).
  - Correct password during block still returned `429`.
  - Correct password after cooldown returned `200` (normal auth resumed).

### N-4 XSS/input sanitization on user-visible labels
- Result: **PASS**
- Evidence:
  - Payload `<img src=x onerror=alert(1)>` used in org/project names.
  - No browser dialog/script execution observed (`dialogCount = 0`).
  - Payload rendered as text, not executable markup.

### N-5 Large-data responsiveness
- Result: **PASS**
- Evidence:
  - Recent snapshots for `project_id=18`, `agent_id=agent-A` reached **217** items (`limit=400` query).
  - High-repeat run (`repeat_runs=100`) succeeded on backend with output:
    - `backend/tmp/rg-round3-n5-repeat100.json`
    - elapsed `247.65s`, pass/fail/flaky = `3/0/0`
  - Browser checks (30s wait budget) confirmed no sustained loading-panel lock and map render (`React Flow`) on both Live View and Release Gate.
  - Added deterministic tab latency probe:
    - script: `frontend/scripts/release_gate_tab_latency_probe.js`
    - selectors: `rg-data-tab-logs` / `rg-data-tab-datasets` + explicit panel state markers
    - run result (`rounds=8`):
      - logs: p95/max = `2ms` / `2ms`
      - datasets: p95/max = `2ms` / `2ms`
      - guardrail check passed (`p95<=2500ms`, `max<=5000ms`)

### N-6 Analytics payload privacy (frontend + backend)
- Result: **PASS**
- Backend:
  - Sanitization logic confirmed in `backend/app/core/analytics.py` (sensitive key redaction, email redaction, string truncation).
  - Runtime sample verification confirmed redaction/truncation:
    - `email/password/api_key/token/nested.secret` -> `[REDACTED]`
    - long free-text truncated to length `200`
- Frontend:
  - Added QA test sink hook in `frontend/lib/analytics.ts` (`window.__AGENTGUARD_ANALYTICS_SINK__`) to verify emitted capture payloads in environments where external PostHog egress is unstable.
  - Added probe page `frontend/app/internal/analytics-sanitization/page.tsx` and e2e script `frontend/scripts/analytics_sanitization_e2e.js`.
  - E2E verification result:
    - `email/password/api_key/access_token/nested.secret` -> `[REDACTED]`
    - email-like value in non-sensitive key (`contact`) -> `[REDACTED]`
    - long string -> truncated to `200`
    - array -> capped to `20`
    - script output: `"Frontend analytics sanitization checks passed."`

---

## 2) RG-2 / RG-3 (Priority 2)

### RG-2 repeat_runs matrix
- Result: **PASS (backend invariants)**
- Executed via:
  - `backend/scripts/release_gate_repeat_matrix_test.py`
  - Output: `backend/tmp/rg-round2-repeat-matrix.json`
- Verified:
  - `repeat_runs` propagation for `1,10,50`
  - summary/export consistency
  - aggregate fail/flaky rate consistency

### RG-3 PASS/FAIL/FLAKY classification
- Result: **PASS (backend invariants), PARTIAL (UI surfacing automation)**
- Executed via:
  - `backend/scripts/release_gate_flaky_profile.ps1`
  - Output: `backend/tmp/rg-round2-flaky-profile.json`
- Verified:
  - Flaky profile produced `flaky=1` with `repeat_runs=10`
  - classification invariants held in script checks
- UI note:
  - Headless automation did not consistently land on the same report-detail state to assert `k/N passed` text every run. Backend outputs are correct; UI assertion is marked partial pending deterministic UI selector flow.

---

## 3) Free Tier Limits Regression (Priority 3)

### FT-1 Usage endpoint limit visibility
- Result: **PASS**
- Live API evidence (`/api/v1/auth/me/usage`):
  - `plan_type = free`
  - `limits.platform_replay_credits_per_month = 50`
  - `usage_this_month.platform_replay_credits = 63`
  - `limits.snapshots_per_month = 10000`, `limits.projects = 1` exposed as expected.

### FT-2 Hosted Release Gate credit gate (platform model)
- Result: **PASS**
- Live API evidence (`POST /api/v1/projects/18/release-gate/validate-async`, `model_source=platform`):
  - Returned `403` with code `LIMIT_PLATFORM_REPLAY_CREDITS`.
  - User-facing message and `next_steps` payload were present and actionable.

### FT-3 BYOK/detected path should not be blocked by hosted-credit cap
- Result: **PASS**
- Live API evidence (`POST /api/v1/projects/18/release-gate/validate-async`, `model_source=detected`):
  - Returned `202` (job accepted/running) under the same account state where platform mode was blocked.
  - Confirms credit gate is scoped to hosted (`platform`) mode only.

### FT-4 Legacy limit integration tests health
- Result: **PASS (migrated)**
- `backend/tests/integration/test_api_test_limits.py` was updated from removed legacy routes to current Release Gate checks:
  - `platform` mode over-credit -> `403` + `LIMIT_PLATFORM_REPLAY_CREDITS`
  - `detected` mode under same credit state -> not blocked by hosted-credit gate
- Verification:
  - `python -m pytest -q tests/integration/test_api_test_limits.py` -> `2 passed`

---

## 4) Files Added/Changed In This Round

- `backend/app/services/brute_force_protection.py`
  - Redis-down fallback for brute-force throttling + cooldown-safe lockout expiry.
- `backend/tests/unit/test_brute_force_protection.py`
  - Unit coverage for fallback thresholding/captcha/reset + cooldown expiry behavior.
- `frontend/lib/analytics.ts`
  - Added optional QA sink hook (`window.__AGENTGUARD_ANALYTICS_SINK__`) for deterministic emitted-payload verification.
- `frontend/app/internal/analytics-sanitization/page.tsx`
  - Added internal probe page that emits a sensitive-field analytics event for QA runs.
- `frontend/scripts/analytics_sanitization_e2e.js`
  - Added Playwright-based sanitizer assertion script for emitted frontend analytics payloads.
- `frontend/components/shared/RailwaySidePanel.tsx`
  - Added optional `tabTestIdPrefix` prop so tab selectors stay stable in automation.
- `frontend/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGateExpandedView.tsx`
  - Added deterministic test ids for data tabs and panel state variants (loading/error/empty/list).
- `frontend/scripts/release_gate_tab_latency_probe.js`
  - Added headless tab-switch latency probe for N-5 responsiveness verification.
- `docs/round2-security-rg-priority-check-report.md`
  - This execution report.

---

## 5) Recommended Next Actions (Order) — end of Round 2

Short-term CI/infra hygiene items that surfaced during Round 2:

1. Promote analytics sanitizer probe into CI smoke (optional): run `node frontend/scripts/analytics_sanitization_e2e.js` in a frontend e2e job.
2. Promote Release Gate tab latency probe into CI smoke (optional): run `node frontend/scripts/release_gate_tab_latency_probe.js` for regressions in panel responsiveness.
3. Gradually migrate remaining `datetime.utcnow()` usage to timezone-aware UTC (`datetime.now(datetime.UTC)`) to reduce deprecation noise in test/runtime logs.

These can be picked up opportunistically alongside future rounds.

---

## 6) Runtime Re-Verification: Usage Tracking Warning

- Result: **PASS**
- What was fixed:
  - `SubscriptionService` was migrated from removed `usage.metric_type` schema assumptions to current `Usage(metric_name, quantity, timestamp)` aggregation/persist logic.
  - `background_tasks` usage-tracking error path now uses structured logger warning instead of `print`.
- Live re-verification:
  - Sent a burst of 25 authenticated `POST /api/v1/api-calls` requests (`project_id=18`) to exercise the same async background tracking path used during bulk seed.
  - All requests returned `202 accepted` (`accepted=25, failed=0`).
  - Log scan after burst showed no matches for:
    - `Error tracking usage:`
    - `has no attribute 'metric_type'`
    - related usage-tracking failure messages in this path.

---

## 7) Round 3 Testing Backlog (Remaining Manual Scenarios)

Round 1–2 focused on Live View / Release Gate core flows, security hardening (N-1 ~ N-6), usage tracking, and free-tier limits. The following groups of scenarios remain **unexecuted or only lightly exercised** and are recommended as the backbone of **Round 3**.

### Group 1 — Release Gate Overrides & Canonical Layer (High Impact)

- Manual doc sections:
  - `D. Candidate Overrides (OVR-1 ~ OVR-6)`
  - `OVR. Canonical Step 레이어 검증 (OVR-C1 ~ OVR-C7)`
  - `OVR-S. 보안 시나리오 (S1 ~ S7)`
  - WARN table (`OVR-6 WARN-1 ~ WARN-9`)
- Goal:
  - Prove that provider/model detection, model/system prompt/JSON/tools overrides, canonical step extraction, and security fallbacks behave exactly as spec’d under both happy-path and malformed-payload conditions.
- Suggested approach:
  - Add focused unit tests around `parse_tool_args`, `_validate_tool_args_schema`, `_detect_provider`, `_dedup_tool_calls_by_id`, and `response_to_canonical_steps`.
  - Add 1–2 Playwright or API-driven flows that generate tool-call heavy snapshots and run Release Gate with overrides enabled, asserting WARN states and canonical outputs.

### Group 2 — RBAC/Admin Boundaries & Role UX

- Manual doc sections:
  - `J. Admin Access Boundary (J-1 ~ J-2)`
  - `K. Project Role Boundary (K-1 ~ K-7)`
  - `M-2. Permission denial message quality`
- Goal:
  - Hard-verify that owner/admin/member/viewer and non-superuser roles see correct `403` behavior on all admin/project/team/dataset/API-key mutations, with actionable error copy.
- Suggested approach:
  - Add API tests per route group (admin, project settings, members, Live View mutations, behavior datasets, project user-api-keys, org members).
  - Add at least one browser flow that exercises a forbidden action and validates 403 messaging quality.

### Group 3 — Plans & Billing UI + Superuser Limit Skip

- Manual doc sections:
  - `F-4, F-5` (Free tier usage/limits UI + optional superuser skip)
  - `G. Plans & Billing UI (G-1 ~ G-4)`
- Goal:
  - Ensure that what users see in Pricing and Billing/Usage matches the free-plan + hosted-credit behavior already validated at the API layer, and that any superuser/preview semantics are clear.
- Suggested approach:
  - Add Playwright flows for landing Pricing CTA behavior (logged-out vs logged-in), Billing/Usage plan/usage bars, and paid-plan cards being read-only.
  - Add one integration/unit test that explicitly verifies superuser limit-skipping behavior if implemented.

### Group 4 — Profile, Service API Keys, and Auth Flows

- Manual doc sections:
  - `H. Profile & Service API Keys (H-1 ~ H-5)`
  - `I. Login & Signup Flow (I-1 ~ I-3)`
  - (extends N-1 re-auth checks with more UX coverage)
- Goal:
  - Lock in basic account hygiene: profile updates, service API key lifecycle (create/rename/revoke), password change, and login/signup/reauth query-mode behavior.
- Suggested approach:
  - Add API + browser tests that drive `/settings/profile` and `/login` with the documented query parameters and assert one-time reveal, persistence, and redirect behavior.

### Group 5 — Operational Alerting

- Manual doc sections:
  - `OPS-1 ~ OPS-7`
- Goal:
  - Validate that alerting triggers for Live View/Release Gate/DB/snapshot anomalies, deduplicates within cooldown windows, and emits clear recovery notifications; confirm the admin dry-run endpoint wiring.
- Suggested approach:
  - In a safe test environment or with a mocked webhook sink, run scripted scenarios to cross alert thresholds and capture emitted payloads.
  - At minimum, exercise `POST /api/v1/admin/ops-alerts/test` (OPS-7) and verify end-to-end delivery to the configured sink.

### Group 6 — Projects List & Legal/Trust UX

- Manual doc sections:
  - `L. Projects list (L-1 ~ L-5)`
  - `M. Role UX + Legal/Security Surfaces (M-1, M-3 ~ M-5)`
- Goal:
  - Polish the high-level console and marketing surfaces: search/filter behavior, alert labels, role explainer, and legal/trust link wiring.
- Suggested approach:
  - Add lightweight Playwright checks for projects search/filter/alert labels and for legal links from org settings and landing footer.

Round 3 should start with Groups 1–3 (higher security/product risk) and then proceed through Groups 4–6 as schedule allows.

---

## 8) Round 3 Progress Update — Group 1 (Overrides/Canonical)

Status: **IN PROGRESS (test harness expanded)**

### Added unit coverage

- `backend/tests/unit/test_canonical_layer.py`
  - `parse_tool_args` robustness:
    - dict/string(valid JSON)/string(invalid JSON)/non-dict JSON/None/number
    - oversize payload handling (`_too_large`, `_invalid`, `_raw`)
  - provider detection and canonicalization:
    - `_detect_provider` hint precedence + OpenAI/Anthropic/Google/unknown shape cases
    - `response_to_canonical_tool_calls` id dedup and id-conflict fail-closed behavior
    - `response_to_canonical_steps` guarantees minimum `llm_call` step and sets `_provider_unknown` / `_id_conflict` metadata
  - behavior rule execution:
    - `_validate_tool_args_schema` invalid/raw handling and reserved-key behavior (`_raw`, `_invalid`, `_too_large`)
    - `_run_behavior_validation` system violations (`unknown provider`, `id conflict`, `empty tool name`)
    - `tool_forbidden` / `tool_allowlist` rule-path checks

- `backend/tests/unit/test_release_gate_model_policy.py`
  - existing pinned model policy checks retained
  - added override sanitizer coverage:
    - `_sanitize_replay_overrides` removes disallowed content keys (`messages/response/trace_id/agent_id/...`)
    - returns `None` when only disallowed keys are present
  - added provider helper coverage:
    - `_normalize_provider`, `_infer_provider_from_model`
  - added hosted credit gate coverage:
    - `_enforce_platform_replay_credit_limit` no-op for detected mode
    - allow-path when quota is available
    - block-path returns `403` with `LIMIT_PLATFORM_REPLAY_CREDITS`

- `backend/tests/integration/test_release_gate_preflight_guards.py`
  - endpoint-level preflight guards:
    - unresolved snapshot provider -> `422` with `provider_resolution_failed`
    - production Anthropic custom model (unpinned id) -> `422` with `release_gate_requires_pinned_model`

### Verification

- Executed:
  - `python -m pytest -q backend/tests/unit/test_canonical_layer.py backend/tests/unit/test_release_gate_model_policy.py`
  - `python -m pytest -q backend/tests/integration/test_release_gate_preflight_guards.py`
- Result:
  - `37 passed` (unit + integration in this Group 1 update)

### Remaining in Group 1

- Add API/integration coverage for release-gate preflight error code matrix where applicable (e.g. provider resolution/missing provider keys/pinned-model enforcement in endpoint path).
- Add deterministic frontend automation for WARN state surfacing (`WARN-1 ~ WARN-9`) using stable selectors/messages.

---

## 9) Round 3 Progress Update — Group 2 (Admin/RBAC boundary, backend expanded)

Status: **IN PROGRESS (backend boundary matrix expanded)**

- Added `backend/tests/integration/test_admin_access_boundary.py`
  - Non-superuser access to read-only admin/internal endpoints is denied:
    - `GET /api/v1/admin/stats` -> `403`
    - `GET /api/v1/admin/users` -> `403`
    - `GET /api/v1/internal/usage/credits/by-project` -> `403`
  - Non-superuser mutation endpoint denial:
    - `POST /api/v1/admin/ops-alerts/test` -> `403`

- Added `backend/tests/integration/test_project_role_boundary.py`
  - Member role cannot mutate project-level resources:
    - `PATCH /api/v1/projects/{project_id}` -> `403`
    - `DELETE /api/v1/projects/{project_id}` -> `403`
  - Member role cannot manage team membership:
    - `POST/PATCH/DELETE /api/v1/projects/{project_id}/members...` -> `403`
  - Member role cannot mutate Live View admin surfaces:
    - `PATCH /live-view/agents/{agent_id}/settings` -> `403`
    - `DELETE /live-view/agents/{agent_id}` -> `403`
    - `POST/DELETE /saved-logs...` mutation routes -> `403`
  - Member role cannot mutate BYOK keys, but can read:
    - `POST /projects/{project_id}/user-api-keys` -> `403`
    - `DELETE /projects/{project_id}/user-api-keys/{key_id}` -> `403`
    - `GET /projects/{project_id}/user-api-keys` -> `200`
  - Member role cannot delete behavior datasets:
    - `POST /projects/{project_id}/behavior-datasets/{dataset_id}/delete` -> `403`
  - Error-message quality (`M-2`) assertion:
    - 403 payload includes required role set (`owner/admin`) and current role hint (`member`) with escalation guidance text.

- Verification:
  - `python -m pytest -q backend/tests/integration/test_project_role_boundary.py backend/tests/integration/test_admin_access_boundary.py`
  - Result: `7 passed`

Note:
- Some legacy admin mutation routes referenced in older checklist text (`/admin/init-db`, `/admin/generate-sample-data`, `/admin/upgrade-user-subscription`) are not currently mounted in this runtime and returned `404` during probing; Group 2 assertions now target actively mounted admin endpoints.

---

## 10) Round 3 Progress Update — Group 3 (Plans/Billing + superuser limit skip, backend)

Status: **STARTED (backend policy path fixed + tests added)**

- Fixed backend policy gap for `F-5`:
  - `check_project_limit` now supports superuser bypass (`is_superuser=True` -> allow).
  - `POST /api/v1/projects` now passes `current_user.is_superuser` into the project-limit check.

- Added `backend/tests/integration/test_superuser_limit_skip.py`
  - Superuser can create project even when free project cap is already reached.
  - Superuser is not blocked by hosted platform replay credit gate (`LIMIT_PLATFORM_REPLAY_CREDITS` not returned).
  - Live View snapshot ingestion path passes superuser flag into snapshot-limit guard.

- Expanded `backend/tests/unit/test_usage_limits.py`
  - Superuser bypass for platform replay credit limit.
  - Superuser bypass for snapshot limit.

- Verification:
  - `python -m pytest -q backend/tests/integration/test_superuser_limit_skip.py backend/tests/unit/test_usage_limits.py backend/tests/integration/test_api_test_limits.py`
  - Result: `9 passed`

Frontend progress in Group 3:
- Added deterministic browser script: `frontend/scripts/pricing_billing_ui_assert.js`
  - Covered checks:
    - `G-1` logged-out Free CTA routing (`/login?mode=signup`)
    - `G-2` paid CTA disabled state on landing (Join waitlist / Contact sales)
    - `G-1` logged-in Free CTA routing (`/organizations`)
    - `G-3/G-4` billing page assertions (Free plan badge, platform replay credits usage ratio, Current Plan / Preview Only states)
  - Script command:
    - `npm run qa:g-billing-ui`
  - Current result in local env:
    - **PASS** after Billing fallback hardening:
      - `free_cta_to_signup_or_login=true`
      - `paid_cta_disabled=true`
      - `free_cta_to_org_console=true`
      - `billing_free_plan_badge=true`
      - `billing_snapshots_ratio=true`
      - `billing_platform_credits_ratio=true`
      - `billing_free_current_plan=true`
      - `billing_paid_preview_only_disabled=true`

- Billing hardening implemented (`frontend/app/organizations/[orgId]/billing/page.tsx`):
  - Added usage fallback fetch (`/api/v1/auth/me/usage`) when SWR `myUsage` is temporarily unavailable.
  - Added `effectiveUsage` projection and stable fallback rendering for snapshots/platform credits rows.
  - Prevents silent omission of snapshot usage row (`G-3`) during transient usage-data load failures.

Remaining in Group 3:
- None on backend + core frontend assertions (`F-5`, `G-1~G-4`) in this round.

---

## 11) Round 3 Progress Update — Group 4 (Profile/Auth, backend + browser)

Status: **STARTED (core H/I/N-1 baseline automated)**

- Added `backend/tests/integration/test_settings_profile_api_keys.py` for `H` scenarios:
  - `H-1` profile update persists (`GET/PATCH /api/v1/settings/profile`)
  - `H-2` API key create + one-time reveal semantics (`POST /api/v1/settings/api-keys`)
  - `H-3` API key rename persists (`PATCH /api/v1/settings/api-keys/{key_id}`)
  - `H-4` API key revoke removes active key (`DELETE /api/v1/settings/api-keys/{key_id}`)
  - `H-5` password change validation + successful login with new password (`PATCH /api/v1/settings/password`, `POST /api/v1/auth/login`)

- Fixed discovered backend defect during Group 4:
  - `backend/app/api/v1/endpoints/settings.py`
    - `PATCH /settings/profile` previously refreshed before flush, which could revert in-memory updates in response/tests.
    - Added `db.flush()` before `db.refresh(current_user)` so profile updates persist correctly.

- Added browser automation script for `I` and `N-1` login-re-auth consistency:
  - `frontend/scripts/login_query_flow_assert.js`
  - Script command: `npm run qa:i-login-flow`
  - Covered checks:
    - `I-1` signup query mode (`/login?mode=signup&intent=trial`) shows signup UI
    - `I-2` login `next=/organizations` redirect behavior
    - `I-3` reauth banner visibility (`/login?reauth=1`)
    - `N-1` consistency: reauth query param is removed from URL after display

- Verification:
  - `python -m pytest -q backend/tests/integration/test_settings_profile_api_keys.py` -> `3 passed`
  - `npm run qa:i-login-flow` -> `ok: true`
  - `npm run qa:n1-reauth-matrix` -> `ok: true`
    - Matrix covered:
      - missing token -> `/organizations`, `/settings/profile` => login + reauth banner
      - invalid token -> `/organizations`, `/settings/profile` => login + reauth banner

Remaining in Group 4:
- Optional hardening only:
  - Add one more protected project-level surface (e.g., release-gate or live-view route) to the reauth matrix.
  - Add visual-only assertions for profile page success toasts/messages if we want stricter UI polish coverage.

---

## 12) Round 3 Progress Update — Group 5 (Operational Alerting, core automation)

Status: **STARTED (OPS-1~7 baseline automated)**

- Added `backend/tests/unit/test_ops_alerting_service.py`:
  - `OPS-1`: Live View API degradation trigger emits warning with project metrics payload.
  - `OPS-2`: Release Gate failure burst emits warning with failure window context.
  - `OPS-3`: DB error burst emits critical alert by error class/count.
  - `OPS-4`: High snapshot 5xx ratio emits project-level warning.
  - `OPS-5`: Dedup/cooldown suppresses repeated identical incident alerts.
  - `OPS-6`: Recovery notification emits once when incident condition clears.

- Added `backend/tests/integration/test_admin_ops_alerts_dry_run.py`:
  - `OPS-7`: superuser call to `POST /api/v1/admin/ops-alerts/test` returns `202 accepted` and triggers controlled dry-run emission path.

- Verification:
  - `python -m pytest -q backend/tests/unit/test_ops_alerting_service.py backend/tests/integration/test_admin_ops_alerts_dry_run.py`
  - Result: `7 passed`

Remaining in Group 5:
- Optional environment-level validation with a real/mocked webhook sink to capture end-to-end outbound payload delivery formatting.

---

## 13) Round 3 Progress Update — Group 6 (Projects list + Legal/Trust UX, browser automation)

Status: **STARTED (core browser automation added and passing in current env)**

- Added browser automation script:
  - `frontend/scripts/projects_legal_ux_assert.js`
  - command: `npm run qa:l-m-legal-ux`
  - covered checks:
    - `L-1 ~ L-5`: projects search/filter UX, filter active state, click-outside close, and alert label format
    - `M-1`: Team page `Role Access Guide` visibility
    - `M-3`: Org Settings `Legal & Security` links wiring (`/terms`, `/privacy`, `/security`)
    - `M-4`: public legal pages render without login + cross-link validity to `/security`
    - `M-5`: landing footer legal links
    - `M-6`: Privacy/Security third-party + US baseline disclosure text

- Verification:
  - `npm run qa:l-m-legal-ux` -> `ok: true`
  - rerun with hardened fallback (project-cap-safe):
    - project creation attempts remained `403` in current org (`orgProjectCounts: { "11": 1 }`)
    - script now uses mocked projects API fallback for `L-1/L-3` when two live mutable projects are unavailable
    - resulting checks remained `ok: true` with `l13Mode = mocked_projects_api_fallback`

- Residual Group 3 (`G-1 ~ G-4`) re-check:
  - `npm run qa:g-billing-ui` -> `ok: true`
  - confirms Free CTA routing, paid CTA disabled state, Billing ratio visibility, and Current Plan/Preview Only card states remain stable.

Remaining in Group 6:
- None for the current automation scope (`L-1~L-5`, `M-1`, `M-3~M-6`) in this round.
- Optional extra confidence pass:
  - Re-run `npm run qa:l-m-legal-ux` in a tenant with >=2 live mutable projects to validate `L-1/L-3` on pure live data (without fallback mocking).

---

## 14) Round 3 Progress Update — INT/INT-6 end-to-end onboarding flow

Status: **COMPLETED (scripted SDK + Release Gate happy path)**

- Extended `backend/scripts/manual_e2e_test.py` (Phase 3: SDK Integration):
  - After sending an API call and verifying:
    - Live View agents visible for the test project
    - Release Gate agents visible for the same project
  - Added `test_release_gate_quick_run`:
    - Uses the Live View-detected `agent_id`
    - Calls `POST /api/v1/projects/{project_id}/release-gate/validate` with:
      - `use_recent_snapshots=true`, `agent_id=<live-view agent>`
      - `evaluation_mode="replay_test"`, `repeat_runs=1`
      - lenient thresholds (`fail_rate_max=1.0`, `flaky_rate_max=1.0`) so the check focuses on end-to-end wiring, not specific verdicts
    - Asserts HTTP 200 + minimal shape guarantees (`pass`, `case_results` fields present).

- Verification:
  - `cd backend && python scripts/manual_e2e_test.py`
  - Result in current env:
    - All phases passed; Release Gate quick run executed successfully on recent snapshots.
    - Ops dry-run check remains **skipped** unless `AGENTGUARD_ADMIN_TOKEN` is provided, as documented.

- Checklist mapping:
  - **INT**: Covered by signup/login/profile/API key + SDK-style API call + Live View / Clinical Log visibility in `manual_e2e_test.py`.
  - **INT-6**: Covered by the same script executing:
    - organization/project creation (or reuse)
    - SDK-style first call
    - Live View agent discovery
    - Release Gate quick run on recent snapshots for that agent.

---

## 15) Round 3 Progress Update — OVR/Canonical + override metadata + export consistency

Status: **COMPLETED (OVR/OVR-S + WARN matrix + export consistency)**

- Added/extended automated coverage:
  - `backend/tests/unit/test_canonical_layer.py`
    - proxy-wrapped OpenAI response summary parsing
    - Google multi-candidate functionCall collection
    - Anthropic `tool_use` arg normalization
  - `backend/tests/integration/test_release_gate_overrides_and_export.py` (new)
    - `provider_model_mismatch` -> `422` guard validation
    - `missing_provider_keys` -> `400` with provider list validation
    - replay override sanitizer enforcement (disallowed content keys stripped before replay execution)
    - model override (`platform`) vs use detected (`detected`) candidate metadata verification
    - behavior report export JSON/CSV consistency check (`report_id`, `status`)
  - `frontend/scripts/release_gate_warn_ui_assert.js` (new)
    - command: `npm run qa:rg-warn-ui`
    - covers browser-level WARN assertions:
      - WARN-9 baseline 미선택 시 Start 비활성 + 안내 문구
      - WARN-2 platform override 활성 시 key-block 경고 해제 + Start 가능
      - WARN-5 Config-only JSON 파싱 오류 메시지
      - WARN-6 tool parameters JSON 오류 경고(현재 UI 동작: inline validation)

- Verification run:
  - `python -m pytest -q backend/tests/unit/test_canonical_layer.py backend/tests/unit/test_release_gate_model_policy.py backend/tests/integration/test_release_gate_preflight_guards.py backend/tests/integration/test_release_gate_overrides_and_export.py`
  - Result: **46 passed**
  - `npm run qa:rg-warn-ui`
  - Result: **ok: true**

- Checklist impact:
  - Closed: Baseline detected provider/model consistency
  - Closed: Model override reflection + revert to detected behavior
  - Closed: WARN matrix (`WARN-1~WARN-9`) with backend + browser split coverage
  - Closed: Copy/Export consistency
  - Closed: OVR / OVR-S blocks
