# Support GPT Regression Gate Demo (A1)

This folder contains the first content demo: a tiny "customer support bot service"
that uses the PluvianAI SDK (same as product docs), sends LLM calls via the OpenAI
client, and lets PluvianAI capture traffic for Live View and Release Gate replay.

This README mirrors the plan from `docs/demo-support-bot-a1-plan.md`, translated
for English-first publishing (Reddit/HN/dev communities).

## Purpose

- Build a self-contained demo in one folder only.
- Do not touch production app logic.
- Reproduce a common pain: "I changed a prompt/model and something silently broke."

## What This Demo Does

1. Reads support questions from `questions.json` (worst-case + normal cases).
2. Calls `pluvianai.init(api_key=..., project_id=..., api_url=...)` (same as docs).
3. Uses the OpenAI client for each question; the SDK captures each call and sends it to PluvianAI.
4. Traffic appears in Live View; you can replay snapshots in Release Gate (baseline vs candidate).

## Files In This Folder

- `run_demo.py`: Inits PluvianAI SDK and sends each question via the OpenAI client (SDK captures and reports).
- `questions.json`: Input dataset for the support bot demo.
- `.env.example`: PluvianAI API key, project ID, API URL, OpenAI key.
- `requirements.txt`: `pluvianai`, `openai`, `python-dotenv`.
- `README.md`: This guide.

## Prerequisites

- Pluvian backend running.
- A project created in Pluvian UI (you need the project ID and an API key from Project Settings → API Keys).
- OpenAI API key (for real LLM calls; the SDK captures them and sends to PluvianAI).

## Config

Copy `.env.example` to `.env` and fill values:

- `PLUVIANAI_API_KEY` — from Project Settings → API Keys.
- `PLUVIANAI_PROJECT_ID` — project ID (e.g. from the project URL).
- `PLUVIANAI_API_URL` — backend base URL (e.g. `http://localhost:8000`).
- `OPENAI_API_KEY` — your OpenAI key for chat completions.
- `AGENT_NAME` (optional, default: `support-bot`).

## Run

From this directory:

1. `pip install -r requirements.txt` (installs `pluvianai` and `openai`; same as docs).
2. Copy `.env.example` to `.env` and set `PLUVIANAI_API_KEY`, `PLUVIANAI_PROJECT_ID`, `OPENAI_API_KEY`, and optionally `PLUVIANAI_API_URL`.
3. `python run_demo.py`

The script uses `pluvianai.init()` then calls the OpenAI client; the SDK captures each call and sends it to PluvianAI. Check Live View to see the traffic.

## Recommended Dataset Size

- For quick smoke test: 6-10 questions.
- For content-quality evidence: 20-40 questions (recommended for this demo).

This folder now uses 24 questions total:

- 12 worst-case
- 12 normal

## Screenshot Plan (for content)

Capture 3 screenshots:

1. Problem setup (same app, changed prompt/model).
2. Release Gate run screen.
3. Result screen (pass/fail + diff evidence).

## Open-Source Alternatives (Context)

There are solid OSS tools for LLM eval/regression, e.g. promptfoo and similar
frameworks. Most are output/eval-centric. This demo focuses on a different angle:

- replaying real captured traffic,
- checking behavior-level drift through snapshots,
- making release decisions with gate-style evidence.

## Related Docs

- `docs/demo-support-bot-a1-plan.md`
- `docs/content-and-demo-execution-plan.md`

