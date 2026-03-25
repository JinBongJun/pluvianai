# PluvianAI Python SDK

Zero-config monitoring for LLM APIs. Automatically track all your OpenAI, Anthropic, and other LLM API calls without changing your code.

## Installation

```bash
pip install pluvianai
```

## Quick Start

### Zero-Config Setup (Recommended)

```python
import pluvianai

# Initialize with environment variables
pluvianai.init()

# That's it! All OpenAI calls are now automatically monitored
from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Environment Variables

Set these environment variables:

```bash
export PLUVIANAI_API_KEY="your-api-key"
export PLUVIANAI_PROJECT_ID="123"
export PLUVIANAI_API_URL="https://api.pluvianai.com"  # Optional
export PLUVIANAI_AGENT_NAME="my-agent"  # Optional
```

### Security / privacy (ingest payload)

The SDK sends **copies** of `request_data` / `response_data` to PluvianAI. Your application’s in-memory objects are unchanged.

| Setting | Env | Effect |
|--------|-----|--------|
| Log request message bodies | `PLUVIANAI_LOG_REQUEST_BODIES` | `false` / `0` → replace `messages[].content` with `[omitted]` + length metadata before send |
| Log response message bodies | `PLUVIANAI_LOG_RESPONSE_BODIES` | Same for `choices[].message.content` |
| Log tool_event input/output | `PLUVIANAI_LOG_TOOL_PAYLOADS` | Same for `tool_events[].input` / `.output` |
| **All of the above** | `PLUVIANAI_LOG_USER_CONTENT` | `0` / `false` → applies to request, response, and tool payloads (unless overridden per-flag) |
| Max request JSON size | `PLUVIANAI_MAX_REQUEST_BODY_BYTES` | Default `524288` (512 KiB UTF-8); over limit → stub payload |
| Max response JSON size | `PLUVIANAI_MAX_RESPONSE_BODY_BYTES` | Same |

Constructor overrides: `pluvianai.init(log_request_bodies=False, …)` (see `pluvianai.PluvianAI`).

See also: `docs/live-view-trust-data-collection.md`, `docs/live-view-ingest-field-matrix.md`.

### Manual Initialization

```python
import pluvianai

pluvianai.init(
    api_key="your-api-key",
    project_id=123,
    agent_name="my-agent"
)
```

### Agent Chain Tracking

To track a chain of API calls that belong to the same workflow:

```python
import pluvianai
from openai import OpenAI

pluvianai.init()
client = OpenAI()

# Use context manager to group related calls into a chain
with pluvianai.chain("user-query-123", agent_name="data-collector"):
    # All calls within this block will have the same chain_id
    response1 = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Collect data"}]
    )

    response2 = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Analyze data"}]
    )

    # Both calls will be grouped under chain_id="user-query-123"
    # You can view them in the Agent Chains page
```

### Queuing and batching

Events are queued and sent in the background to avoid blocking your application. You can tune batching:

- **`flush_at`** / `PLUVIANAI_FLUSH_AT`: Max number of events to batch before sending (default: 10).
- **`flush_interval`** / `PLUVIANAI_FLUSH_INTERVAL`: Max seconds to wait before sending a batch (default: 5.0).

In short-lived environments (e.g. serverless, scripts), call **`flush()`** or **`shutdown()`** before process exit so pending events are sent:

```python
import pluvianai
pluvianai.init()
# ... your LLM calls ...

pluvianai.flush()   # Send pending events now
# or
pluvianai.shutdown()  # Flush and stop background worker
```

### Manual Tracking

If you prefer to track calls manually:

```python
import pluvianai
import time

start_time = time.time()
# ... make your API call ...
latency_ms = (time.time() - start_time) * 1000

pluvianai.track_call(
    request_data={"model": "gpt-4", "messages": [...]},
    response_data={"choices": [...]},
    latency_ms=latency_ms,
    status_code=200,
    agent_name="my-agent",
    chain_id="user-query-123"  # Optional: group related calls
)
```

## Features

- **Zero-config**: Automatically patches OpenAI SDK
- **Non-blocking**: Doesn't slow down your application
- **Error handling**: Gracefully handles failures
- **Agent tracking**: Track different agents in your system

## Tool calls & workflow structure (optional)

The zero-config patching focuses on **LLM API calls** (requests/responses, latency, tokens/cost when available).

If you want PluvianAI to reliably validate **tool usage policies** across *any* framework (custom tools, LangChain,
n8n-style workflows, HTTP/DB/Slack/email actions) — especially tool **results** and strict ordering — you may need to
add lightweight, explicit instrumentation in your code (for example, wrapping tool execution or emitting tool events).

This is intentional: tool execution typically happens outside the LLM client, so it cannot always be inferred from LLM
API traffic alone.

### Sending tool I/O with manual ingest (`tool_events`)

When you use `track_call` / `POST /api/v1/projects/{project_id}/api-calls`, you can attach an optional **`tool_events`** array so Live View and Release Gate can show **recorded** tool results (instead of dry-run simulation) during replay.

Minimal shape (see server docs for limits: max 50 events, redaction, etc.):

```python
pluvianai.track_call(
    request_data={...},
    response_data={...},
    latency_ms=latency_ms,
    status_code=200,
    tool_events=[
        {"kind": "tool_call", "name": "get_weather", "call_id": "call_abc", "input": {"city": "Seoul"}},
        {"kind": "tool_result", "name": "get_weather", "call_id": "call_abc", "output": {"temp_c": 22}, "status": "ok"},
        # Optional: side-effect audit trail (email, Slack, HTTP) — kind "action"
        {"kind": "action", "name": "send_slack", "output": {"ok": True}, "status": "ok"},
    ],
)
```

Use the **same `call_id`** the provider returned on `tool_call` / `tool_use` so replay can match baseline results to the model’s tool calls. If the provider omits ids, the server may still match **recorded** results by **tool name** order (weak match).

## License

MIT
