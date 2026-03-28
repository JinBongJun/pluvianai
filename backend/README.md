# Backend (FastAPI)

## Database and Alembic

CI runs **migrations on an empty PostgreSQL database**, then **`alembic check`** so the schema at `head` matches SQLAlchemy models loaded in `alembic/env.py`. See [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (job **Backend (Alembic)**).

### Reproduce CI locally (recommended before merging DB changes)

Use the same URL as CI: `postgresql://pluvianai_ci@localhost:5432/pluvianai` (trust auth, empty DB).

**1. Start Postgres 16** (pick one):

- **Docker** (matches CI image):

  ```bash
  docker run --rm -d --name pluvianai-ci-pg \
    -e POSTGRES_USER=pluvianai_ci \
    -e POSTGRES_DB=pluvianai \
    -e POSTGRES_HOST_AUTH_METHOD=trust \
    -p 5432:5432 \
    postgres:16-alpine
  ```

  If port `5432` is already in use, map another host port (e.g. `-p 55432:5432`) and set `DATABASE_URL` accordingly.

- **Docker Compose**: ensure a service exposes the same user/db (or override `DATABASE_URL`).

**2. Point the backend at that database and run Alembic** (from repo root or `backend/`):

```bash
export DATABASE_URL="postgresql://pluvianai_ci@localhost:5432/pluvianai"
export ENVIRONMENT=development
cd backend
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m alembic check
```

PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://pluvianai_ci@127.0.0.1:5432/pluvianai"
$env:ENVIRONMENT = "development"
cd backend
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m alembic check
```

`alembic check` should print **no** “New upgrade operations detected”. If it does, add or adjust a migration (or the model) until the diff is gone.

**Note:** `backend/.env` may set `DATABASE_URL` to Railway or another host. For parity with CI, override `DATABASE_URL` in the shell for the commands above.

### Rules for schema changes

1. **Model + migration in the same PR**  
   Do not change `app/models/*` without an Alembic revision unless the change is documentation-only.

2. **`alembic/env.py` must see every persisted model**  
   Import new models from `app.models` in `env.py` so `target_metadata` matches what the app uses. Avoid “import only in services” for tables that should exist in the database.

3. **Foreign keys**  
   Match `ForeignKey(..., ondelete="...")` in models and migrations.

4. **Indexes**  
   Prefer explicit `Index(...)` in `__table_args__` when you need composite or named indexes. Avoid redundant `index=True` on primary keys (Postgres already indexes PKs).

5. **Legacy tables**  
   If a table is no longer part of the product, drop it in a migration and remove dead code paths; do not leave orphan tables that are absent from `Base.metadata`.

### Layout

| Path | Role |
|------|------|
| `alembic/env.py` | Loads `Base.metadata` and DB URL from settings |
| `alembic/versions/` | Revision scripts |
| `app/models/` | SQLAlchemy models |

### Tests

```bash
cd backend
python -m pytest -c pytest-ci.ini
```

See [`tests/README.md`](./tests/README.md) for more on the test layout.

## Billing Webhook Observability

- Prometheus metric: `billing_webhook_events_total{result,event_type}`
- Result labels: `success`, `ignored`, `duplicate`, `error`
- Metrics endpoint: `GET /metrics` (in **production**, set `EXPOSE_METRICS_ENDPOINT=true` or it stays disabled by default)
- Webhook logs include `event_id`, `event_type`, `status`
- DLQ retry endpoint: `POST /api/v1/billing/webhook/retry/{event_id}`
- Manual reconcile endpoint: `POST /api/v1/billing/reconcile?limit=200`
- **Grafana / Prometheus alerts:** [`../docs/billing-prometheus-grafana-alerts.md`](../docs/billing-prometheus-grafana-alerts.md)
- **Example alert rules:** [`../deploy/prometheus/billing-webhook-alerts.example.yml`](../deploy/prometheus/billing-webhook-alerts.example.yml)
