# PluvianAI

**Test your LLM changes on real user inputs before you deploy.**

Replay real production traffic with new prompts, models, or settings, and see what actually changes before hitting production.

---

## The problem

LLMs don't produce a single output. Same input → different outputs.

So this happens:
1. You test a few cases → outputs look fine
2. Dashboards are green → seems safe
3. You deploy → behavior mysteriously changes in production

You didn't test what actually matters: **real user inputs at scale.**  

A single spot check doesn't catch behavioral drift. It won't tell you if the agent started calling tools in a different order, or if latency randomly spikes 40% of the time under load.

---

## The solution

PluvianAI replays real user traffic before deployment to catch flaky behavior.

1. **Capture:** We passively record real production inputs via SDK.
2. **Baseline:** Save a selection of known-good traces as a dataset.
3. **Change:** Update your prompt, model, or agent settings.
4. **Replay:** Run the same baseline inputs against the new config multiple times.
5. **Gate:** Compare baseline vs new behavior and decide whether it's safe to ship.

Now you can see what breaks, what changes, and what becomes unstable before it reaches users.

---

## What makes it different

### 1. Multi-run testing (Catch flakiness)
Run the exact same input 10x. If it succeeds 6/10 times, the dashboard flags it as `FLAKY`. You can see the variance instead of trusting a single lucky run.

### 2. Tool sequence edit distance
Outputs might look the same while the underlying mechanics break. We normalize tool calls across OpenAI, Anthropic, and Google, then compute the edit distance on the tool execution graph. We catch when an agent subtly swaps the order of operations.

### 3. Real user inputs
Test against what your users actually send in production — not synthetic, mocked-up eval datasets.

### 4. Deterministic evaluation (No LLM judges)
Use reproducible, rule-based checks:
- JSON validity
- Hard latency thresholds
- Expected length
- PII & Keyword leakage

---

## Quick start

### Python
```python
import pluvianai

pluvianai.init(api_key="YOUR_API_KEY")
```

### Node.js
```typescript
import pluvianai from 'pluvianai';

pluvianai.init({ apiKey: 'YOUR_API_KEY' });
```

---

## Tech stack

* Backend: FastAPI (Python)
* Database: PostgreSQL + JSONB
* Frontend: Next.js
* SDKs: Python, Node.js (`pluvianai`)
* Infrastructure: Docker, Redis

---

## Documentation
- [DOCS_README.md](./docs/DOCS_README.md) — Index
- [BLUEPRINT.md](./docs/BLUEPRINT.md) — Architecture Blueprint
- [SCHEMA_SPEC.md](./docs/SCHEMA_SPEC.md) — API schema specification

---
## License
MIT
