# PluvianAI Node.js SDK

Zero-config monitoring for LLM APIs. Automatically track all your OpenAI, Anthropic, and other LLM API calls without changing your code.

## Installation

```bash
npm install pluvianai
```

## Quick Start

### Zero-Config Setup (Recommended)

```javascript
import pluvianai from 'pluvianai';

// Initialize with environment variables
pluvianai.init();

// That's it! All OpenAI calls are now automatically monitored
import OpenAI from 'openai';
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Environment Variables

Set these environment variables:

```bash
export PLUVIANAI_API_KEY="your-api-key"
export PLUVIANAI_PROJECT_ID="123"
export PLUVIANAI_API_URL="https://api.pluvianai.com"  # Optional
export PLUVIANAI_AGENT_NAME="my-agent"  # Optional
```

### Security / privacy

The Node SDK applies the same ingest-side sanitization as Python: request/response bodies and tool event payloads can be omitted or truncated based on config and env (e.g. `PLUVIANAI_LOG_USER_CONTENT`, `PLUVIANAI_LOG_REQUEST_BODIES`, `PLUVIANAI_LOG_RESPONSE_BODIES`, `PLUVIANAI_LOG_TOOL_EVENT_PAYLOADS`, `PLUVIANAI_MAX_INGEST_BYTES`). See [`docs/live-view-trust-data-collection.md`](../../docs/live-view-trust-data-collection.md) and [`sdk/python/README.md`](../python/README.md#security--privacy-ingest-payload) for the full policy matrix.

### Manual Initialization

```javascript
import pluvianai from 'pluvianai';

pluvianai.init({
  apiKey: 'your-api-key',
  projectId: 123,
  agentName: 'my-agent',
});
```

### Agent Chain Tracking

To track a chain of API calls that belong to the same workflow:

```javascript
import pluvianai from 'pluvianai';
import OpenAI from 'openai';

pluvianai.init();
const openai = new OpenAI();

await pluvianai.chain('user-query-123', 'data-collector', async () => {
  const response1 = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Collect data' }],
  });

  const response2 = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Analyze data' }],
  });

  // Both calls will be grouped under chain_id="user-query-123"
});
```

### Manual Tracking

If you prefer to track calls manually:

```javascript
import pluvianai from 'pluvianai';

await pluvianai.trackCall(
  { model: 'gpt-4', messages: [...] },
  { choices: [...] },
  150,
  200,
  'my-agent',
  'user-query-123'
);
```

## Tool calls & `tool_events` (optional)

Zero-config patching records **LLM API** traffic. Tool **execution** often happens outside the client, so for Live View and Release Gate to show **recorded** tool results (instead of dry-run simulation), attach an optional **`tool_events`** array when calling `trackCall` (7th argument), or send the same field on `POST /api/v1/projects/{project_id}/api-calls`.

Use the **same `call_id`** the provider returned on `tool_call` / `tool_use` when possible. Server enforces max event count and size; see backend docs.

```javascript
await pluvianai.trackCall(
  { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Hi' }] },
  { choices: [{ message: { content: '…' } }] },
  120,
  200,
  'my-agent',
  'trace-abc',
  [
    { kind: 'tool_call', name: 'get_weather', call_id: 'call_abc', input: { city: 'Seoul' } },
    { kind: 'tool_result', name: 'get_weather', call_id: 'call_abc', output: { temp_c: 22 }, status: 'ok' },
  ]
);
```

If you omit `agent_name` / `chain_id`, pass `undefined` before `tool_events`:

```javascript
await pluvianai.trackCall(req, res, latencyMs, 200, undefined, undefined, toolEvents);
```

## License

MIT
