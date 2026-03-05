# PluvianAI

**The symbiotic guardian for AI agents.**  
Agent behavior firewall for multi‑LLM applications — capture traffic, replay safely, and enforce policies before release.

---

## Core value

- **Deterministic, judge‑free evaluation**: atomic signals (JSON validity, latency, length, keywords, PII, etc.) instead of fuzzy “LLM judges”.
- **Agent‑level diagnostics**: Live View shows nodes, clinical logs, input/output data, and evaluation on a single canvas.
- **Release Gate**: replay saved traffic with model/prompt overrides, evaluate against policies, and get a pass/fail gate verdict so you can see whether the node still behaves like the baseline before you decide to ship.

---

## Main features

| Area | Description |
|------|-------------|
| **Live View** | Ingest traffic via SDKs and inspect each agent node with logs, payloads, and evaluation signals. |
| **Release Gate** | Fix a baseline trace or saved dataset, replay with new models/prompts, and run regression policies → pass/fail decision per run. |
| **Atomic Signals** | Rule‑based checks (latency, length, JSON schema, PII, keywords, etc.) that are reproducible and provider‑agnostic. |
| **Behavior Rules** | Validate tool usage and trajectories using a canonical step layer across OpenAI, Anthropic, Google, and others. |

---

## Tech stack

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + JSONB
- **Frontend**: Next.js (TypeScript, App Router)
- **SDKs**: Python (`agentguard`), Node.js (`@agentguard/sdk`)
- **Infrastructure**: Docker, Redis

---

## Quick start

### 1. Instrument your app with the SDKs

**Python**

```python
import agentguard

agentguard.init(api_key="YOUR_API_KEY")
```

**Node.js**

```typescript
import agentguard from '@agentguard/sdk';

agentguard.init({ apiKey: 'YOUR_API_KEY' });
```

Once SDKs are initialized and traffic flows, agents and nodes will appear in **Live View** automatically.

### 2. Capture and save data

1. Send traffic through your application as usual.  
2. Use **Live View → Save data** to create named datasets (e.g. `Saved 2026‑03‑02`).  
3. Each dataset is a stable collection of snapshots you can reuse for regression and release decisions.

### 3. Validate changes with Release Gate

1. Go to the **Release Gate** tab for a project.  
2. Pick a node and a dataset (recent snapshots or a saved dataset).  
3. Configure model/prompt overrides and gate thresholds (fail/flaky rates).  
4. Run **Validate** to:
   - replay snapshots with the new configuration,
   - evaluate behavior using atomic signals and behavior rules,
   - get a gate decision: **PASS** or **FAIL**, with per‑run breakdown and history.

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

The root `.md` files are the single source of truth for documentation (the `docs/` folder may contain older drafts).

- **[DOCS_README.md](./DOCS_README.md)** — documentation index and navigation.
- **[BLUEPRINT.md](./BLUEPRINT.md)** — technical blueprint (architecture, APIs, roadmap).
- **[BUSINESS_PLAN.md](./BUSINESS_PLAN.md)** — business plan.
- **[SCHEMA_SPEC.md](./SCHEMA_SPEC.md)** — API schema specification.
- **[PRD_AGENT_BEHAVIOR_VALIDATION.md](./PRD_AGENT_BEHAVIOR_VALIDATION.md)** — behavior validation PRD.

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

---

## Environment variables (SDK)

```bash
export AGENTGUARD_API_KEY="your-api-key"
export AGENTGUARD_PROJECT_ID="your-project-id"
export AGENTGUARD_API_URL="https://api.example.com"  # Optional, defaults to hosted API
```

Refer to the SDK READMEs under `sdk/python` and `sdk/node` for more details.

---

## License

MIT
