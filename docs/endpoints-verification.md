# API v1 Endpoints Verification

Frontend `api.ts` uses `baseURL: API_URL + "/api/v1"`. All paths below are relative to `/api/v1`.

## Live View (Clinical Log, DATA tab, Snapshot Detail)

| Frontend (liveViewAPI) | Backend (live_view.py) | Status |
|------------------------|------------------------|--------|
| GET `/projects/{id}/live-view/agents` | GET same | OK |
| GET `/projects/{id}/live-view/agents/{agent_id}/settings` | GET same | OK |
| PATCH `/projects/{id}/live-view/agents/{agent_id}/settings` | PATCH same | OK |
| DELETE `/projects/{id}/live-view/agents/{agent_id}` | DELETE same | OK |
| GET `/projects/{id}/snapshots` (params: agent_id, limit, offset, light) | GET same | OK |
| GET `/projects/{id}/snapshots/{snapshot_id}` | GET same | OK |
| GET `/projects/{id}/live-view/agents/{agent_id}/evaluation` | GET same | OK |
| POST `/projects/{id}/snapshots` | POST same | OK |

## Behavior (Datasets, Rules, Reports)

| Frontend (behaviorAPI) | Backend (behavior.py) | Status |
|------------------------|------------------------|--------|
| GET `/projects/{id}/behavior/datasets` | GET same | OK |
| POST `/projects/{id}/behavior/datasets` | POST same | OK |
| POST `/projects/{id}/behavior/datasets/batch` (body: `{ items: ValidationDatasetCreate[] }`) | POST same | OK |
| GET `/projects/{id}/behavior/datasets/{dataset_id}` | GET same | OK |
| PATCH `/projects/{id}/behavior/datasets/{dataset_id}` | PATCH same | OK |
| GET `/projects/{id}/behavior/datasets/{dataset_id}/snapshots` | GET same | OK |
| POST `/projects/{id}/behavior/datasets/{dataset_id}/delete` | POST same | OK |
| POST `/projects/{id}/behavior/datasets/batch-delete` (body: `{ dataset_ids: string[] }`) | POST same | OK |
| GET `/projects/{id}/behavior/rules` | GET same | OK |
| POST `/projects/{id}/behavior/rules` | POST same | OK |
| PUT `/projects/{id}/behavior/rules/{rule_id}` | PUT same | OK |
| DELETE `/projects/{id}/behavior/rules/{rule_id}` | DELETE same | OK |
| GET `/projects/{id}/behavior/reports` | GET same | OK |
| GET `/projects/{id}/behavior/reports/{report_id}/export` | GET same | OK |
| POST `/projects/{id}/behavior/validate` | POST same | OK |

## User API Keys (Project default + Node override)

| Frontend (projectUserApiKeysAPI) | Backend (user_api_keys.py) | Status |
|------------------------|------------------------|--------|
| GET `/projects/{id}/user-api-keys` | GET same | OK |
| POST `/projects/{id}/user-api-keys` (body: `{ provider, api_key, agent_id? }`) | POST same | OK |
| DELETE `/projects/{id}/user-api-keys/{key_id}` | DELETE same | OK |

## Release Gate

| Frontend (releaseGateAPI) | Backend (release_gate.py) | Status |
|---------------------------|---------------------------|--------|
| GET `/projects/{id}/release-gate/agents` | GET same | OK |
| GET `/projects/{id}/release-gate/agents/{agent_id}/recent-snapshots` | GET same | OK |
| GET `/projects/{id}/release-gate/agents/{agent_id}/recommended-snapshots` | GET same | OK |
| POST `/projects/{id}/release-gate/validate` (supports `model_source: detected|platform`) | POST same | OK |
| GET `/projects/{id}/release-gate/suggest-baseline` | GET same | OK |
| GET `/projects/{id}/release-gate/history` | GET same | OK |

## Router Registration (backend/app/api/v1/__init__.py)

- `live_view.router` — prefix `""` → paths are under `/api/v1/projects/...`, `.../snapshots/...`
- `behavior.router` — prefix `""` → paths under `/api/v1/projects/.../behavior/...`
- `release_gate.router` — prefix `""` → paths under `/api/v1/projects/.../release-gate/...`

All three are included in `api_router`, which is mounted in `main.py` with `prefix="/api/v1"`.

## Dataset delete path note

- Frontend calls **POST** `/projects/{id}/behavior/datasets/{dataset_id}/delete` (behavior router).
- Backend also has **POST** `/projects/{id}/behavior-datasets/{dataset_id}/delete` (projects router). The app uses the **behavior** path; both exist.

## How to re-check registered routes

From repo root:

```bash
cd backend
python -c "
from app.main import app
routes = sorted({getattr(r, 'path', '') for r in app.routes if getattr(r, 'path', '').startswith('/api/v1')})
for p in routes:
    print(p)
print('Total:', len(routes))
"
```

Or run the backend and open: `GET /api/v1/debug/routes` (no auth).

---

**Last verified:** All endpoints used by Live View, DATA tab, Behavior (datasets/rules/reports), and Release Gate are registered and match frontend calls.
