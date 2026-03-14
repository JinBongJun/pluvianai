# Role Action Gap Analysis (Step 1 Completion)

This document compares the role matrix (`docs/role-action-matrix.md`) with the current backend enforcement.

## Scope Reviewed

- Project endpoints under `backend/app/api/v1/endpoints/*`
- Organization settings and deletion endpoints
- Organization member endpoints under `backend/app/api/v1/endpoints/organizations.py`
- Project member management and project-scoped provider key management
- Shared permission helper: `backend/app/core/permissions.py`

## Findings

### Aligned (No Gap)

- **Project deletion** is owner-only.
  - Enforced via `required_roles=[ProjectRole.OWNER]`.
- **Project member mutations** are owner/admin only.
  - Enforced via `required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN]`.
- **Project-scoped provider key create/delete** are owner/admin only.
  - Enforced via `required_roles=[ProjectRole.OWNER, ProjectRole.ADMIN]`.
- **Project read-level features** (Live View, Release Gate, alerts, costs) allow any project member role.
- **Organization member listing** allows any organization member role.
  - Enforced via `GET /organizations/{org_id}/members`.
- **Organization member invite/remove** are owner/admin only.
  - Enforced via `POST /organizations/{org_id}/members` and `DELETE /organizations/{org_id}/members/{member_id}`.
- **Organization owner cannot be removed** through member-management routes.
  - Enforced via explicit guard against owner membership deletion.

### Aligned (Improved UX)

- Shared 403 permission copy now includes:
  - required role(s),
  - current role,
  - next step hint ("Ask a project owner or admin ...").
- Organization member mutation routes now return the same style of denial detail:
  - required role(s),
  - current role,
  - next step hint ("Ask the organization owner to update your role if needed.").

### Verified By Test

- `backend/tests/integration/test_organization_members_api.py`
  - owner can list/invite/remove members
  - viewer can list but cannot invite/remove

### Remaining Minor Gaps

- **Action-specific denial copy** is improved for org member management, but other organization routes
  still have mixed wording and should be normalized as a follow-up for absolute consistency.

## Recommendation

- Treat this as **functionally complete for Step 1 MVP**, with one follow-up hardening pass:
  1. Full denial-message wording normalization across org/project endpoints,
  2. Optional admin-to-admin edge-case policy review for org member removal/edit semantics.
