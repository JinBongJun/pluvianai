# Authorization and Scoping

**Purpose:** Single reference for URL conventions, project-scoping rules, and multi-tenant isolation so we avoid cross-project access and schema/constraint mismatches.

---

## 1. URL conventions

- **Project-scoped resources** use the path prefix `/api/v1/projects/{project_id}/...`. The `project_id` in the URL is the scope; the backend must verify that the resource (e.g. alert, config, key) belongs to that project and that the user has access to the project.
- **Examples:**
  - Alerts: `GET /api/v1/projects/{project_id}/alerts`, `POST .../alerts/{alert_id}/resolve`
  - API Calls: `GET/POST /api/v1/projects/{project_id}/api-calls`, `GET .../api-calls/{call_id}`, `GET .../api-calls/stats`
  - Firewall: `GET/POST /api/v1/projects/{project_id}/firewall/rules`, `PATCH/DELETE .../firewall/rules/{rule_id}`, `POST .../firewall/rules/{rule_id}/toggle`
  - User API keys: `GET/POST/DELETE /api/v1/projects/{project_id}/user-api-keys/...`
  - Live View / Release Gate / Signals: under project context; list/mutate always filtered by `project_id`.
  - Activity: `GET /api/v1/activity?project_id=...` — when `project_id` is provided, project access is enforced via `check_project_access` (no access → 403).
- **Avoid:** Top-level resource-by-id URLs that do not include `project_id` (e.g. `POST /alerts/{id}/resolve`). They force the backend to load the resource first to know the project and are easier to misuse; prefer `POST /projects/{project_id}/alerts/{id}/resolve` and validate `resource.project_id == project_id`.

---

## 2. Project-scoped authorization

- **Every project-scoped endpoint** must:
  1. Resolve `project_id` from the path (or from the resource and then validate).
  2. Call `check_project_access(project_id, current_user, db)` (or equivalent) to enforce org/project membership.
  3. For mutations (update/delete), ensure the target resource’s `project_id` matches the path `project_id`; if not, return 404 (not 403) to avoid leaking existence.
- **RBAC:** Use `required_roles` where applicable (e.g. Owner/Admin for mutations on configs, API keys). See [role-action-matrix](./role-action-matrix.md) and [mvp-endpoint-access-matrix](./mvp-endpoint-access-matrix.md).

---

## 3. Schema and uniqueness

- **Per-project uniqueness:** Tables that represent “per project” entities must enforce uniqueness at `(project_id, ...)` (e.g. `(project_id, system_prompt_hash)` for `agent_display_settings`), not only on the other columns. This prevents cross-tenant collisions and supports soft-delete and display settings per project.
- **Migrations:** When adding or changing unique constraints, consider whether the resource is project-scoped; if so, include `project_id` in the constraint.

---

## 4. Checklist for new or changed endpoints

- [ ] URL includes `project_id` in path when the resource is project-scoped.
- [ ] `check_project_access(project_id, ...)` (or equivalent) is called.
- [ ] Mutations verify `resource.project_id == path project_id`; return 404 on mismatch.
- [ ] Service layer receives `project_id` where needed so queries are explicitly scoped (defense-in-depth).
- [ ] Unique constraints on project-scoped tables include `project_id` where appropriate.
- [ ] Integration tests cover cross-project access (e.g. same resource id in another project returns 404/403).

---

## 5. Related docs

- [mvp-endpoint-access-matrix](./mvp-endpoint-access-matrix.md) — which roles can call which endpoints.
- [audit-live-view-soft-delete-and-related](./audit-live-view-soft-delete-and-related.md) — past fixes for soft-delete and multi-tenant schema.
- [role-action-matrix](./role-action-matrix.md) — role vs action matrix.

---

## 6. Live View + Release Gate domain coupling

- Live View and Release Gate must share the same "visible agents" rule.
- Shared domain module: `backend/app/domain/live_view_release_gate/agent_visibility.py`.
- Backward-compatible shim remains at `backend/app/services/agent_visibility_service.py` to avoid breaking imports while migrating.
