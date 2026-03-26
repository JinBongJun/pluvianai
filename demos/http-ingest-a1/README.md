# HTTP Ingest Demo

A small demo that sends AgentGuard / PluvianAI ingest payloads over plain HTTP instead of the SDK.

## Purpose

- Validate that `POST /api/v1/projects/{project_id}/api-calls` works end-to-end.
- Confirm that snapshots appear in Live View without SDK instrumentation.
- Confirm that `tool_events` and extended JSON fields survive ingest well enough for Live View and Release Gate.
- De-risk integrations from tools like n8n, Make, internal webhooks, or custom orchestrators.

## What This Demo Does

1. Loads API URL, project ID, API key, and agent name from `.env`.
2. Builds 3 HTTP ingest cases:
   - `minimal`: request/response only
   - `tool_events`: request/response + `tool_call` + `tool_result`
   - `extended_context`: tool events + context/sources/attachments
3. Sends each case to `POST /api/v1/projects/{project_id}/api-calls`.
4. Prints the marker, agent name, request URL, and HTTP status so you can check Live View.

## Files

- `run_demo.py` - Sends one or more HTTP ingest cases.
- `.env.example` - API URL, project ID, API key, agent name, scenario.
- `requirements.txt` - `requests`, `python-dotenv`.

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `PLUVIANAI_API_KEY`
   - `PLUVIANAI_PROJECT_ID`
   - `PLUVIANAI_API_URL`
   - `AGENT_NAME` (optional)
   - `SCENARIO` (optional: `minimal`, `tool_events`, `extended_context`, or `all`)
3. Install deps:

```bash
pip install -r requirements.txt
```

4. Run:

```bash
python run_demo.py
```

## Expected Result

- Each request should return `202` with `{"accepted": true}`.
- Live View should show snapshots under the configured `AGENT_NAME`.
- The printed marker should make the snapshots easy to find.
- The `tool_events` case should show a tool timeline in the snapshot detail.

## Notes

- This is intentionally close to how n8n or a generic HTTP client would integrate.
- If the minimal case works, the ingest route and auth are likely fine.
- If the tool case works, `tool_events` mapping is likely fine.
- If the extended case works, extra JSON is flowing through the ingest path too.
