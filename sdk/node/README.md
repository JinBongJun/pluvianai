# AgentGuard Node.js SDK

Zero-config monitoring for LLM APIs. Automatically track all your OpenAI, Anthropic, and other LLM API calls without changing your code.

## Installation

```bash
npm install @agentguard/sdk
```

## Quick Start

### Zero-Config Setup (Recommended)

```typescript
import agentguard from '@agentguard/sdk';

// Initialize with environment variables
agentguard.init();

// That's it! All OpenAI calls are now automatically monitored
import OpenAI from 'openai';

const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
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

```typescript
import agentguard from '@agentguard/sdk';

agentguard.init({
  apiKey: 'your-api-key',
  projectId: 123,
  agentName: 'my-agent'
});
```

### Agent Chain Tracking

To track a chain of API calls that belong to the same workflow:

```typescript
import agentguard from '@agentguard/sdk';
import OpenAI from 'openai';

agentguard.init();
const openai = new OpenAI();

// Use chain function to group related calls into a chain
await agentguard.chain("user-query-123", "data-collector", async () => {
  // All calls within this block will have the same chain_id
  const response1 = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Collect data' }]
  });
  
  const response2 = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Analyze data' }]
  });
  
  // Both calls will be grouped under chain_id="user-query-123"
  // You can view them in the Agent Chains page
});
```

### Manual Tracking

If you prefer to track calls manually:

```typescript
import agentguard from '@agentguard/sdk';
import { performance } from 'perf_hooks';

const startTime = performance.now();
// ... make your API call ...
const latencyMs = performance.now() - startTime;

await agentguard.trackCall(
  { model: 'gpt-4', messages: [...] },
  { choices: [...] },
  latencyMs,
  200,
  'my-agent',
  'user-query-123'  // Optional: group related calls
);
```

## Features

- **Zero-config**: Automatically patches OpenAI SDK
- **Non-blocking**: Doesn't slow down your application
- **Error handling**: Gracefully handles failures
- **Agent tracking**: Track different agents in your system
- **TypeScript support**: Full TypeScript definitions included

## License

MIT
