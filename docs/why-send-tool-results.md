# Why send `tool_result` in `tool_events`?

**Short answer:** Release Gate replays your LLM with candidate settings. If the server only sees **tool names/arguments** but not **what the tool returned**, it must invent a **deterministic dry-run (Simulated)** result. That weakens comparison against the real baseline and lowers **grounding confidence** in the UI.

**What improves when you ingest tool results**

- **Recorded** evidence: replay can inject the same result text the production run saw, so the model’s follow-up and final answer are compared on a fair basis.
- **Live View**: shows a coherent **tool timeline** (call + result) instead of calls-only summaries.
- **Ops**: sustained **missing** evidence ratios can signal broken instrumentation or a provider format change (see §15.4 in the grounding plan).

**What to send**

- Minimal JSON previews are enough; the API applies **redaction** and size limits. Use the same **`call_id`** the provider attached to `tool_call` / `tool_use` when possible.

**References**

- `docs/TOOL_EVENTS_SCHEMA.md` — example payload
- `docs/release-gate-tool-io-grounding-plan.md` — full product/technical plan
- `docs/mvp-node-gate-spec.md` — MVP scope for Live View + Release Gate
