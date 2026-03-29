# k6 Load Tests

Minimal k6 scripts for the two hot paths that have shown 429 risk in this repo:

- `health-smoke.js`: safe unauthenticated smoke test
- `live-view-agents.js`: authenticated Live View agents polling
- `release-gate-job-poll.js`: authenticated polling against an existing Release Gate job
- `release-gate-validate-async.js`: low-volume Release Gate run + poll flow

## Before You Run

1. Install k6 locally.
2. Point the scripts at a safe environment first.
3. Use a real test account and test project.
4. Start with small concurrency, then scale up.

## Shared Environment Variables

Required:

- `BASE_URL`: API base URL, e.g. `http://localhost:8000` or `https://your-api.example.com`

Authentication:

- Prefer `ACCESS_TOKEN`, or
- Set both `EMAIL` and `PASSWORD`

Optional discovery:

- `PROJECT_ID`: skips auto-discovery from `GET /api/v1/projects`
- `AGENT_ID`: skips auto-discovery from `GET /api/v1/projects/:id/release-gate/agents`

## Examples

Health only:

```bash
k6 run -e BASE_URL=http://localhost:8000 load-tests/k6/health-smoke.js
```

Live View agents:

```bash
k6 run ^
  -e BASE_URL=http://localhost:8000 ^
  -e EMAIL=test@example.com ^
  -e PASSWORD=secret ^
  -e PROJECT_ID=1 ^
  load-tests/k6/live-view-agents.js
```

Release Gate job polling against an existing job:

```bash
k6 run ^
  -e BASE_URL=http://localhost:8000 ^
  -e EMAIL=test@example.com ^
  -e PASSWORD=secret ^
  -e PROJECT_ID=1 ^
  -e JOB_ID=job-123 ^
  load-tests/k6/release-gate-job-poll.js
```

Low-volume Release Gate async validation:

```bash
k6 run ^
  -e BASE_URL=http://localhost:8000 ^
  -e EMAIL=test@example.com ^
  -e PASSWORD=secret ^
  -e PROJECT_ID=1 ^
  -e AGENT_ID=my-agent-id ^
  -e RG_REPEAT_RUNS=1 ^
  -e RG_RECENT_SNAPSHOT_LIMIT=5 ^
  load-tests/k6/release-gate-validate-async.js
```

If the run needs a saved provider key:

```bash
k6 run ^
  -e BASE_URL=http://localhost:8000 ^
  -e EMAIL=test@example.com ^
  -e PASSWORD=secret ^
  -e PROJECT_ID=1 ^
  -e AGENT_ID=my-agent-id ^
  -e RG_REPLAY_USER_API_KEY_ID=123 ^
  -e RG_MODEL_SOURCE=detected ^
  load-tests/k6/release-gate-validate-async.js
```

If the run needs a direct provider key override:

```bash
k6 run ^
  -e BASE_URL=http://localhost:8000 ^
  -e EMAIL=test@example.com ^
  -e PASSWORD=secret ^
  -e PROJECT_ID=1 ^
  -e AGENT_ID=my-agent-id ^
  -e RG_REPLAY_PROVIDER=openai ^
  -e RG_NEW_MODEL=gpt-4o-mini ^
  -e RG_REPLAY_API_KEY=sk-... ^
  load-tests/k6/release-gate-validate-async.js
```

## Suggested Order

1. Run `health-smoke.js`
2. Run `live-view-agents.js`
3. Run `release-gate-job-poll.js` against a known job
4. Run `release-gate-validate-async.js` at very low volume

## What To Watch

- `http_req_failed`
- `http_req_duration`
- 429 responses
- API/DB/Redis CPU and latency in your hosting dashboard

## Notes

- These scripts use bearer auth so they do not need CSRF cookies.
- `release-gate-validate-async.js` can create real replay jobs and consume credits / provider quota.
- `release-gate-job-poll.js` is the safer first script for the current 429 hotspot.
