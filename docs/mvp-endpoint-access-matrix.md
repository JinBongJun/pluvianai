# MVP Endpoint Access Matrix

This document is the operational access baseline for PluvianAI MVP.
It summarizes which authenticated identities can call key API endpoints.

## Actors

- `anonymous`: not authenticated
- `authenticated user`: any logged-in user
- `org member`: user in `organization_members`
- `project member`: user with project access via owner or `project_members`
- `project admin`: `owner` or `admin` in project scope
- `project owner`: owner only
- `superuser`: platform operator (`is_superuser = true`)

## Auth Endpoints

| Endpoint | Method | Access |
|---|---|---|
| `/api/v1/auth/register` | `POST` | anonymous |
| `/api/v1/auth/login` | `POST` | anonymous |
| `/api/v1/auth/me` | `GET` | authenticated user |
| `/api/v1/auth/me/usage` | `GET` | authenticated user |

## User Settings Endpoints

| Endpoint | Method | Access |
|---|---|---|
| `/api/v1/settings/profile` | `GET` | authenticated user |
| `/api/v1/settings/profile` | `PATCH` | authenticated user |
| `/api/v1/settings/password` | `PATCH` | authenticated user |
| `/api/v1/settings/api-keys` | `GET` | authenticated user |
| `/api/v1/settings/api-keys` | `POST` | authenticated user |
| `/api/v1/settings/api-keys/{key_id}` | `PATCH` | authenticated user |
| `/api/v1/settings/api-keys/{key_id}` | `DELETE` | authenticated user |

## Organization Endpoints (Current MVP Behavior)

| Endpoint | Method | Access |
|---|---|---|
| `/api/v1/organizations` | `GET` | authenticated user |
| `/api/v1/organizations` | `POST` | authenticated user |
| `/api/v1/organizations/{org_id}` | `GET` | org owner or org member |
| `/api/v1/organizations/{org_id}/projects` | `GET` | org owner or org member |
| `/api/v1/organizations/{org_id}` | `PATCH` | org owner only |
| `/api/v1/organizations/{org_id}` | `DELETE` | org owner only |

Notes:
- `organization_members.role` exists in schema, but org mutation endpoints are currently owner-only.

## Project Endpoints

| Endpoint | Method | Access |
|---|---|---|
| `/api/v1/projects` | `GET` | authenticated user (returns accessible projects) |
| `/api/v1/projects` | `POST` | authenticated user (within plan limits). `generate_sample_data=true` is superuser-only. |
| `/api/v1/projects/{project_id}` | `GET` | project member |
| `/api/v1/projects/{project_id}/data-retention-summary` | `GET` | project member |
| `/api/v1/projects/{project_id}` | `PATCH` | project admin (`owner` or `admin`) |
| `/api/v1/projects/{project_id}` | `DELETE` | project owner only |
| `/api/v1/projects/{project_id}/panic` | `POST` | project admin (`owner` or `admin`) |
| `/api/v1/projects/{project_id}/panic` | `GET` | project member |
| `/api/v1/projects/{project_id}/rubrics` | `POST` | project admin (`owner` or `admin`) |
| `/api/v1/projects/{project_id}/rubrics` | `GET` | project member |
| `/api/v1/projects/{project_id}/apply-patch` | `POST` | project admin (`owner` or `admin`) |
| `/api/v1/projects/{project_id}/behavior-datasets/{dataset_id}/delete` | `POST` | project admin (`owner` or `admin`) |

## Project Member Management Endpoints

| Endpoint | Method | Access |
|---|---|---|
| `/api/v1/projects/{project_id}/members` | `GET` | project member |
| `/api/v1/projects/{project_id}/members` | `POST` | project admin (`owner` or `admin`) |
| `/api/v1/projects/{project_id}/members/{user_id}` | `PATCH` | project admin (`owner` or `admin`) |
| `/api/v1/projects/{project_id}/members/{user_id}` | `DELETE` | project admin (`owner` or `admin`) |

## Live View / Release Gate / Project User API Keys

| Endpoint Group | Access |
|---|---|
| Live View read routes (`GET /projects/{project_id}/live-view/...`, snapshots read) | project member |
| Live View mutation routes (agent settings/delete, saved-logs create/delete/clear) | project admin (`owner` or `admin`) |
| Snapshot ingest (`POST /projects/{project_id}/snapshots`) | project member (plus plan/usage limits) |
| Release Gate routes (`/projects/{project_id}/release-gate/...`) | project member (plus GuardCredit limits where applicable) |
| Project user API keys list (`GET /projects/{project_id}/user-api-keys`) | project member |
| Project user API keys create/delete (`POST/DELETE /projects/{project_id}/user-api-keys...`) | project admin (`owner` or `admin`) |

## Admin and Internal Endpoints

| Endpoint | Method | Access |
|---|---|---|
| `/api/v1/admin/init-db` | `POST` | superuser only |
| `/api/v1/admin/generate-sample-data` | `POST` | superuser only |
| `/api/v1/admin/upgrade-user-subscription` | `POST` | superuser only |
| `/api/v1/admin/stats` | `GET` | superuser only |
| `/api/v1/admin/users` | `GET` | superuser only |
| `/api/v1/admin/users/{user_id}/impersonate` | `POST` | superuser only |
| `/api/v1/admin/impersonate/{session_id}` | `DELETE` | superuser only |
| `/api/v1/internal/usage/credits/by-project` | `GET` | superuser only |

## Implementation Notes

- Project scope checks are enforced through `check_project_access(...)`.
- Superuser checks are standardized via `require_admin(...)`.
- This matrix is an MVP baseline and should be updated whenever endpoint access rules change.

