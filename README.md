# PluvianAI

**The symbiotic guardian for AI agents.**  
Agent behavior firewall for multi‑LLM applications — capture traffic, replay safely, and enforce policies before release.

---

## Core value

- **Deterministic, judge‑free evaluation**: atomic signals (JSON validity, latency, length, keywords, PII, etc.) instead of fuzzy “LLM judges”.
- **Agent‑level diagnostics**: Live View shows nodes, clinical logs, input/output data, and evaluation on a single canvas.
- **Release Gate**: replay saved traffic with model/prompt overrides, evaluate against policies, and get a pass/fail gate verdict so you can see whether the node still behaves like the baseline before you decide to ship.
- **Flexible model source control**: run validation with **Detected baseline**, **PluvianAI Hosted**, or **Custom (BYOK)** model sources, including direct one-run keys and reusable saved keys for custom runs.

---

## Main features

| Area | Description |
|------|-------------|
| **Live View** | Ingest traffic via SDKs and inspect each agent node with logs, payloads, and evaluation signals. |
| **Release Gate** | Fix a baseline trace or saved dataset, replay with new models/prompts, and run regression policies → pass/fail decision per run. Supports Detected/Hosted/Custom (BYOK) model sources. |
| **Atomic Signals** | Rule‑based checks (latency, length, JSON schema, PII, keywords, etc.) that are reproducible and provider‑agnostic. |
| **Behavior Rules** | Validate tool usage and trajectories using a canonical step layer across OpenAI, Anthropic, Google, and others. |

---

## Live View Node Lifecycle

- Removing a Live View node is a **soft delete**.
- Same-node traffic can **auto-restore** a removed node within the configured restore window.
- Old soft-deleted node settings can be **hard-deleted** later by scheduled cleanup.

Current repository defaults:

- `AGENT_AUTO_RESTORE_DAYS=30`
- `AGENT_SOFT_DELETE_GRACE_DAYS=30`

See [`docs/live-view-node-lifecycle-policy.md`](./docs/live-view-node-lifecycle-policy.md) for the full policy.

---

## Tech stack

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + JSONB
- **Frontend**: Next.js (TypeScript, App Router)
- **SDKs**: Python (`pluvianai`), Node.js (`pluvianai`)
- **Infrastructure**: Docker, Redis

---

## Quick start

### 1. Instrument your app with the SDKs

**Python**

```python
import pluvianai

pluvianai.init(api_key="YOUR_API_KEY")
```

**Node.js**

```typescript
import pluvianai from 'pluvianai';

pluvianai.init({ apiKey: 'YOUR_API_KEY' });
```

Once SDKs are initialized and traffic flows, agents and nodes will appear in **Live View** automatically.

### 2. Capture and save data

1. Send traffic through your application as usual.  
2. Use **Live View → Save data** to create named datasets (e.g. `Saved 2026‑03‑02`).  
3. Each dataset is a stable collection of snapshots you can reuse for regression and release decisions.

### 3. Validate changes with Release Gate

1. Go to the **Release Gate** tab for a project.  
2. Pick a node and a dataset (recent snapshots or a saved dataset).  
3. Choose model source (**Detected**, **Hosted by PluvianAI**, or **Custom (BYOK)**), then configure prompt overrides and gate thresholds (fail/flaky rates).  
   - **Detected** uses provider/model seen in baseline data and checks required keys.
   - **Hosted** uses platform hosted models and hosted replay credits.
   - **Custom (BYOK)** accepts direct provider API keys for one run, and supports saving reusable custom-run keys from the Release Gate UI.
4. Run **Validate** to:
   - replay snapshots with the new configuration,
   - evaluate behavior using atomic signals and behavior rules,
   - get a gate decision: **PASS** or **FAIL**, with per‑run breakdown and history.

If a plan limit is reached, use the in-app upgrade CTA to open **`/settings/billing`**.

---

## Project structure

```text
PluvianAI/
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── api/         # API routers
│   │   ├── core/        # settings, security, canonical layer
│   │   ├── models/      # DB models
│   │   ├── services/    # business logic (replay, snapshots, gate, etc.)
│   │   └── middleware/  # proxy & rate limiting
│   └── tests/
├── frontend/             # Next.js frontend
│   ├── app/             # App Router pages
│   ├── components/      # React components
│   └── lib/             # frontend utilities
├── sdk/                  # SDK packages
│   ├── python/
│   └── node/
├── docs/                 # product and architecture docs
└── docker-compose.yml
```

---

## Documentation

Product specs, plans, and security notes live under **`docs/`**. See **[`docs/DOCS_README.md`](./docs/DOCS_README.md)** for the full index.

- **[`docs/BLUEPRINT.md`](./docs/BLUEPRINT.md)** — technical blueprint (architecture, APIs, roadmap).
- **[`docs/BUSINESS_PLAN.md`](./docs/BUSINESS_PLAN.md)** — business plan.
- **[`docs/SCHEMA_SPEC.md`](./docs/SCHEMA_SPEC.md)** — API schema specification.
- **[`docs/PRD_AGENT_BEHAVIOR_VALIDATION.md`](./docs/PRD_AGENT_BEHAVIOR_VALIDATION.md)** — behavior validation PRD.
- **[`docs/live-view-node-lifecycle-policy.md`](./docs/live-view-node-lifecycle-policy.md)** — Live View node soft delete, restore, and purge policy.

---

## Running locally

```bash
# Copy and edit environment variables
cp .env.example .env

# Start services with Docker Compose
docker-compose up -d

# Default endpoints
# Backend:  http://localhost:8000
# Frontend: http://localhost:3000
```

**Backend database migrations:** CI enforces `alembic upgrade head` and `alembic check` on a fresh Postgres. To match that locally and for PR expectations, see **[`backend/README.md`](./backend/README.md)** (Database and Alembic).

---

## Environment variables (SDK)

```bash
export PLUVIANAI_API_KEY="your-api-key"
export PLUVIANAI_PROJECT_ID="your-project-id"
export PLUVIANAI_API_URL="https://api.example.com"  # Optional, defaults to hosted API
```

Refer to the SDK READMEs under `sdk/python` and `sdk/node` for more details.

---

## License

MIT
