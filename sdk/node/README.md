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

## License

MIT
