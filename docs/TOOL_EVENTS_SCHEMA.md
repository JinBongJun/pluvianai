# `tool_events` ingest schema (copy-paste)

Aligned with `POST /api/v1/projects/{project_id}/api-calls`, Python SDK `track_call`, and Node `trackCall` (7th argument). Server validates count/size; see API implementation for limits.

```json
{
  "tool_events": [
    {
      "kind": "tool_call",
      "name": "get_weather",
      "call_id": "call_abc",
      "input": { "city": "Seoul" }
    },
    {
      "kind": "tool_result",
      "name": "get_weather",
      "call_id": "call_abc",
      "output": { "temp_c": 22 },
      "status": "ok"
    },
    {
      "kind": "action",
      "name": "send_slack",
      "output": { "ok": true },
      "status": "ok"
    }
  ]
}
```

- **`kind`**: `"tool_call"` | `"tool_result"` | `"action"` (action = side-effect audit trail).
- **`call_id`**: provider tool id when available — used for Release Gate recorded replay matching.
- **`status`** (tool_result / action): `"ok"` | `"error"` | `"skipped"` (server may normalize).

See also: `docs/release-gate-tool-io-grounding-plan.md`, `sdk/python/README.md`, `sdk/node/README.md`.
