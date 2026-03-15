# Live View / Soft Delete & Related Code Audit

**Auditor stance:** Karpathy-style — cold, meticulous, assume bugs exist.

---

## 1. Fixes Applied This Session

### 1.1 Soft delete not respected in list or UI
- **Cause:** Backend returned all agents (including `is_deleted=True`); frontend did not filter.
- **Fix:** Backend excludes soft-deleted from `final_agents` (Blueprint, Ghost, snapshot-based). Frontend filters `agentsList` by `!a.is_deleted` and uses filtered list for telemetry.
- **Delete when no setting:** Backend now creates `AgentDisplaySetting(..., is_deleted=True)` when none exists so list can exclude the agent.

### 1.2 Empty `all_agent_ids` and SQLAlchemy `.in_()`
- **Risk:** `Model.x.in_(set())` can produce inefficient or inconsistent SQL across DB/SQLAlchemy versions.
- **Fix:** If `all_agent_ids` is empty, skip the query and set `settings_map = {}`.

---

## 2. Critical: Schema vs Application Semantics

**`agent_display_settings`** has:

```python
UniqueConstraint("system_prompt_hash", name="uq_agent_display_settings_system_prompt_hash")
```

So the table allows **only one row per `system_prompt_hash` globally**, not per project.

- Every query in the app filters by **both** `project_id` and `system_prompt_hash`.
- So the intended semantics are **per (project, agent)**.
- **Effect:** In a multi-tenant setup, two projects with the same agent id (same hash) cannot each have a row. Creating a row in `delete_agent` for project B when project A already has that `system_prompt_hash` will raise a unique violation.

**Recommendation:** Add a migration to replace the unique constraint with a **composite** one on `(project_id, system_prompt_hash)` so each project can have its own display setting (and soft-delete) per agent.

---

## 3. Code Quality / Maintainability

### 3.1 Redundant `_ensure_project` in `list_agents`
- Line ~72: `_ensure_project(project_id, current_user, db)` (permission check).
- Line ~125: `project = _ensure_project(project_id, current_user, db)` (to get project for blueprint).
- **Impact:** Double DB/permission work per request. Not wrong, just wasteful. Can keep a single call and reuse `project`.

### 3.2 Bare `except:` in `_aggregate_signals`
- Lines 109 and 120: `except:` and `except: pass` catch everything, including `KeyboardInterrupt`/`SystemExit`.
- **Recommendation:** Catch a specific exception (e.g. `(TypeError, ValueError, KeyError)`) or at least `Exception`, and log.

### 3.3 Ghost / Blueprint payloads omit `is_deleted`
- Backend does not set `is_deleted` on Blueprint or Ghost entries in `final_agents`. Frontend filter is `!a.is_deleted`, so `undefined` is falsy and they are kept. Behavior is correct; adding explicit `is_deleted: false` would make the contract clearer.

---

## 4. Frontend Consistency

- **Selection on delete:** `onAgentDeleted` calls `setSelectedAgentId(null)` and `mutateAgents()`, so the panel closes and the list refreshes. No stale selection.
- **Telemetry:** Uses filtered `agentsList` (non-deleted only), so stats match visible nodes.

---

## 5. Edge Cases Checked

| Case | Result |
|------|--------|
| No snapshots, no blueprint, no sentinel | `all_agent_ids` empty → no `.in_([])`, `settings_map = {}`; no crash. |
| `row.agent_id` is `None` | Treated as `"unknown"` in ids and in `_is_deleted`; consistent. |
| GET settings for deleted agent | Returns `is_deleted: true`; acceptable. |
| Delete agent that never had a setting | Now creates a setting with `is_deleted=True` so list excludes it. |

---

## 6. Other Call Sites of `AgentDisplaySetting`

- **release_gate.py:** Filters by `project_id` and `system_prompt_hash.in_(agent_ids)`; same schema concern if multiple projects share agent ids.
- **behavior.py, snapshot_service, background_tasks:** All filter by `(project_id, system_prompt_hash)`. Logic is consistent; uniqueness constraint is the only mismatch.

---

## 7. Summary

| Severity | Item | Status |
|----------|------|--------|
| High | Soft delete not applied in list/UI | Fixed |
| High | Empty `all_agent_ids` passed to `.in_()` | Fixed (guard added) |
| High | Unique on `system_prompt_hash` only (multi-tenant) | Fixed (composite unique on `(project_id, system_prompt_hash)` + migration) |
| Low | Duplicate `_ensure_project` in `list_agents` | Optional refactor |
| Low | Bare `except` in `_aggregate_signals` | Fixed (`Exception` + debug log) |
| Low | Explicit `is_deleted: false` for Blueprint/Ghost | Optional clarity |

## 8. Related

- **URL and authorization:** [authorization-and-scoping.md](./authorization-and-scoping.md) — project-scoped URL conventions, RBAC, and schema/uniqueness checklist.
- **Endpoint access:** [mvp-endpoint-access-matrix.md](./mvp-endpoint-access-matrix.md) — which roles can call which endpoints (including alerts).
