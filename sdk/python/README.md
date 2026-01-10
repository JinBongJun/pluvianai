# AgentGuard Python SDK

Zero-config monitoring for LLM APIs. Automatically track all your OpenAI, Anthropic, and other LLM API calls without changing your code.

## Installation

```bash
pip install agentguard
```

## Quick Start

### Zero-Config Setup (Recommended)

```python
import agentguard

# Initialize with environment variables
agentguard.init()

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
export AGENTGUARD_API_KEY="your-api-key"
export AGENTGUARD_PROJECT_ID="123"
export AGENTGUARD_API_URL="https://api.agentguard.dev"  # Optional
export AGENTGUARD_AGENT_NAME="my-agent"  # Optional
```

### Manual Initialization

```python
import agentguard

agentguard.init(
    api_key="your-api-key",
    project_id=123,
    agent_name="my-agent"
)
```

### Agent Chain Tracking

To track a chain of API calls that belong to the same workflow:

```python
import agentguard
from openai import OpenAI

agentguard.init()
client = OpenAI()

# Use context manager to group related calls into a chain
with agentguard.chain("user-query-123", agent_name="data-collector"):
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
import agentguard
import time

start_time = time.time()
# ... make your API call ...
latency_ms = (time.time() - start_time) * 1000

agentguard.track_call(
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

## License

MIT
