# MVP Endpoint Access Gap List

This document tracks **known or suspected access-control gaps** between the current implementation and the intended RBAC posture for MVP.

Use together with:
- `docs/mvp-endpoint-access-matrix.md` (current baseline)
- `SECURITY.md` (security policy)

## Severity legend

- `P0`: immediate security risk, patch now
- `P1`: high-priority hardening needed
- `P2`: policy/consistency gap, plan and resolve
- `P3`: documentation/test debt

---

## G-1. Live View mutation endpoints are broad (`project member` scope)

- **Severity**: `P1`
- **Status**: `Closed`
- **Area**: `backend/app/api/v1/endpoints/live_view.py`
- **Current behavior**:
  - The following mutation endpoints now require project admin (`owner/admin`) via role-aware access checks:
    - `PATCH /projects/{project_id}/live-view/agents/{agent_id}/settings`
    - `DELETE /projects/{project_id}/live-view/agents/{agent_id}`
    - `POST /projects/{project_id}/live-view/agents/{agent_id}/saved-logs`
    - `POST /projects/{project_id}/live-view/agents/{agent_id}/saved-logs/batch-delete`
    - `DELETE /projects/{project_id}/live-view/agents/{agent_id}/saved-logs`
- **Resolution summary**:
  - Added admin-scoped helper and applied it to mutation routes.
  - Read routes remain member-readable.

---

## G-2. Project-scoped user API keys are writable by any project member

- **Severity**: `P1`
- **Status**: `Closed`
- **Area**: `backend/app/api/v1/endpoints/user_api_keys.py`
- **Current behavior**:
  - `POST /projects/{project_id}/user-api-keys` now requires owner/admin.
  - `DELETE /projects/{project_id}/user-api-keys/{key_id}` now requires owner/admin.
  - `GET /projects/{project_id}/user-api-keys` remains readable for project members.
- **Resolution summary**:
  - Mutation routes narrowed to project admin scope.

---

## G-3. Organization role model exists, but write controls are owner-only

- **Severity**: `P2`
- **Status**: `Closed (MVP policy fixed)`
- **Area**:
  - Model: `backend/app/models/organization.py` (`OrganizationMember.role`)
  - Endpoint: `backend/app/api/v1/endpoints/organizations.py`
- **Current behavior**:
  - Org update/delete checks are owner-only.
  - Org member roles (`admin/member/viewer`) are not yet reflected in mutation permissions.
- **Resolution summary**:
  - MVP policy is explicitly fixed to owner-only for org mutation.
  - Access matrix and security docs treat this as intentional baseline, not a transient gap.

---

## G-4. Admin endpoint protection style is not fully centralized

- **Severity**: `P2`
- **Status**: `Closed`
- **Area**: multiple admin/internal endpoints
- **Current behavior**:
  - Most admin routes now use `require_admin(...)`, but codebase still has mixed direct checks and helper-based checks in other areas.
- **Resolution summary**:
  - Admin/internal gates are standardized on `require_admin(...)` for active admin/internal endpoints.
  - Residual style drift risk is tracked as review discipline, not an open access gap.

---

## G-5. Automated authorization tests are still missing

- **Severity**: `P2`
- **Status**: `Closed (baseline coverage added)`
- **Area**: backend tests
- **Current behavior**:
  - Manual scenarios exist in `docs/manual-test-scenarios-mvp-replay-test.md`.
  - No focused automated RBAC test suite covering owner/admin/member/viewer/superuser boundaries.
- **Resolution summary**:
  - Added integration baseline: `backend/tests/integration/test_api_rbac_boundaries.py`.
  - Added/updated tests now assert permission failures for member mutation routes.

---

## G-6. `generate_sample_data` request behavior is implicit for non-superusers

- **Severity**: `P3`
- **Status**: `Closed`
- **Area**: `backend/app/api/v1/endpoints/projects.py`
- **Current behavior**:
  - On project creation, sample-data generation now runs only when requester is superuser.
  - Non-superuser requests with `generate_sample_data=true` are silently ignored.
- **Resolution summary**:
  - Non-superuser requests with `generate_sample_data=true` now fail with explicit `403`.
  - API behavior is explicit and deterministic.

---

## Suggested execution order

All currently listed gaps are closed for MVP baseline.

