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

## License

MIT
