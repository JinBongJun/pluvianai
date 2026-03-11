# MVP Node Gate Spec

### Purpose

This document defines the **Node Regression Guard (Live View + Release Gate)** scope for the MVP. Implementation and testing follow this spec; product/UX decisions are documented here for traceability.

---

### Product one-line promise (MVP)

**"Per node: automatically collect production logs, replay candidate config N times, and provide PASS/FAIL/FLAKY plus a gate verdict."**
This lets you confirm **whether the node still behaves the same as before**. (Whether to approve a release is up to you.)

---

### Final MVP structure (compact)

#### Live View

- **Node list**
- **Node detail**
  - Node-level snapshot list + Clinical Log / Gate entry CTA
- **Snapshot list (Clinical Log)**
  - Snapshot list + filter (FAIL/WARN/ALL)
  - **Past log immutability**: Capture-time results do not change when viewed later under "new policy"
  - **Clinical log immutability**: Evaluation results at capture time are materialized so they do not change when policy changes
- **Data selection**
  - Select snapshots from Live View into **node-scoped dataset (playlist)**; from there, Saved dataset / recent logs ? Gate run CTA

#### Release Gate

- **Replay Test (unified)**
  - Candidate config (model / provider / model override / JSON / tools overrides)
  - `repeat_runs` option (1 / 10 / 50 / 100; 50/100 show cost warning)
  - Per-case results + attempt pattern visibility for repeated runs
  - Per run: compare baseline (original snapshot) vs run (replay result) tool sequence
  - sequence distance (edit distance), tool divergence (set difference %), Baseline/Run sequences
  - **Human-readable layer**: One-line summary ("Tool call pattern changed by X%.") + band: **Stable** (0?5%) / **Minor change** (5?20%) / **Major change** (>20%). Does not affect Gate verdict (reference only).
- **Gate verdict (release conclusion)**
  - Summary + threshold summary + Export/Copy

#### Onboarding / Integration

- "Data flowing within 5 minutes" experience is top priority
- `POST /projects/{project_id}/snapshots` entry:
  - curl example
  - copy-paste SDK example (Node/Python, one each)

---

### Excluded from MVP (explicit out-of-scope)

- Multi-node simultaneous gate
- Tool execution / E2E pipeline execution
- Approval workflow / permissions / audit logs (enterprise)
- Scoring / clustering / ML-based recommendation

### MVP pricing and limit contract

- Public plans shown in product are limited to **Free / Pro / Enterprise**.
- During the MVP, **only Free is purchasable/active by default**. Pro and Enterprise may be shown as preview-only.
- Limits are split into two buckets:
  - **Product limits**: projects, snapshots, retention, etc.
  - **Hosted replay credits**: only consumed when Release Gate runs with **PluvianAI-hosted models** (`model_source = platform`).
- **BYOK runs do not consume hosted replay credits.**
- When hosted replay credits are exhausted:
  - Release Gate with `model_source = platform` must return **403** with an English upgrade/BYOK message.
  - Release Gate with `model_source = byo` must still be allowed if other product limits are satisfied.
- Billing / Usage UI must clearly label the metric as **platform replay credits**. Legacy internal field names such as `guard_credits_*` may remain for compatibility, but must not be primary user-facing copy.

---

### Core concepts

#### 1) Meaning of "data"

- In Release Gate, "data" means **not the input itself, but a record of input cases (snapshot set)**.
- Node-level gate uses this project?s case set (saved logs / playlist / data volume) to run candidate replays.

#### 2) MVP stance on tool-call

- We do **not** execute tools.
- We only **observe**:
  - tool-call names/args are visible (policy check purpose)
  - Original snapshot has tool-result stubs; replay compares against policy

#### 3) Canonical step (cross-provider behavior check)

- **Policy (Gate) check** evaluates each **step** (one LLM call or one tool call).
- Replay/snapshot results are normalized from **provider-specific raw responses** (OpenAI / Anthropic / Google) into a **canonical step layer** for consistent policy comparison.
- Examples:
  - **OpenAI**: `choices[].message.tool_calls` ? step
  - **Anthropic**: `content[]` with `type: "tool_use"` (name, input) ? step
  - **Google**: `candidates[].content.parts[]` with `functionCall` (name, args) ? step
- Even if snapshot is OpenAI and replay is Anthropic, cross-provider setup can yield PASS/FAIL.
- **Policy (Gate) check** looks at "which tool was called with which arguments" at **step** granularity.

#### Canonical step schema (fixed)

Policy (Gate) and Replay checks depend on **fixed fields** below. Changing this structure can break existing policy/release gate behavior; preserve backward compatibility when changing.

| Field | Type | Description |
|-------|------|-------------|
| `step_order` | number | Sort/reference. Within same response: llm_call = base, tool_call = base + 0.01 * index. |
| `step_type` | `"llm_call"` \| `"tool_call"` | Step type. |
| `tool_name` | string \| null | Tool name. llm_call uses null or `""`. |
| `tool_args` | object | Tool args (dict). Unknown keys may use `_raw`, `_invalid` etc. |

**Extension fields (base_meta etc.):** `agent_id`, `source_id`, `source_type`, `latency_ms` may be merged into the step.

#### Canonical step security and limits

- **Unknown provider:** If response format is unrecognized (provider = unknown), Gate treats it as FAIL.
- **Tool arguments limit:** tool_args must be a valid dict under ~64KB; otherwise `_invalid` + `_too_large` ? violation.
- **Id consistency:** Same tool_call id must match name/args across tool_calls; otherwise violation. steps allow one llm_call.
- **Google:** Only first `candidates[]` with tool_calls is used (single candidate).
- **Tool name normalization:** canonical step normalizes `tool_name` (strip + lower + whitespace collapse) for policy (allowlist/forbidden etc.). Mismatch ? violation.
- **OpenAI compatibility:** OpenAI format reads tool_calls from `choices[].message.tool_calls` (single message).

---

### Replay Test spec (unified mode)

#### Input (candidate config)

- **Model**
  - Original model (default) / Custom model (option)
  - run-only API key input (used only for this run)
- **Pinned-only policy (Release Gate reproducibility)**
  - For Release Gate / CI-style comparisons, the default UX and recommended policy is **pinned model ids** (versioned snapshots), not moving aliases.
  - **Anthropic**: prefer model ids ending with `YYYYMMDD` (pinned snapshots). Avoid `...-latest` / alias-style ids in Gate runs because provider updates can change behavior over time.
  - UI should clearly label when a run uses **Pinned vs Custom** model id for auditability.
  - **Enforcement (current implementation)**:
    - In **production**, Release Gate **enforces pinned-only** for Anthropic model overrides.
    - Escape hatches:
      - **superuser** can use custom model ids
      - `RELEASE_GATE_ALLOW_CUSTOM_MODELS=true` allows custom model ids (emergency)
- **Request JSON / tools overrides**
  - Limited to **configuration-only JSON + tools**, excluding per-snapshot content.
  - Content fields (`messages`, `user_message`, `response`, trace metadata, etc.) always come from snapshots and are **not** provided via JSON payload.

#### Backend API contract (Release Gate validate, MVP)

- **Request: `ReleaseGateValidateRequest` (conceptual shape)**

```json
{
  "agent_id": "node-id",
  "snapshot_ids": ["..."],          // OR dataset_ids: ["..."] (single-node scope only)
  "dataset_ids": ["..."],
  "evaluation_mode": "replay_test", // fixed
  "repeat_runs": 1,

  "model_source": "detected | platform",   // detected = use snapshot/provider model, platform = use PluvianAI-hosted model
  "new_model": "optional-override-model-id",
  "replay_provider": "openai | anthropic | google | null",

  "new_system_prompt": "optional-override-system-prompt",
  "replay_temperature": 0.3,
  "replay_max_tokens": 512,
  "replay_top_p": 1,

  "replay_overrides": {
    "...": "configuration-only fields (see below)"
  }
}
```

- **Config-only contract for `replay_overrides`**
  - Purpose: tweak **how** the LLM is called (sampling, tools, response format, extra config), **never** the **content** of each case.
  - Backend MUST treat the following keys as **disallowed** inside `replay_overrides` (drop or ignore safely if present):
    - `messages`, `message`, `user_message`
    - `response`, `responses`
    - `input`, `inputs`
    - `trace_id`, `agent_id`, `agent_name`
  - All snapshot-specific content (user prompts, model responses, trace metadata) always comes from the stored snapshots, not from overrides.
  - Allowed examples (non-exhaustive; provider-agnostic): `temperature`, `max_tokens`, `top_p`, `seed`, `response_format`, `tools`, `tool_choice`, `metadata`, `json_mode`, `stop`, etc.

- **Response: minimal contract (recap)**
  - Already defined below as **case_results + summary + verdict**; additionally, for UI it is recommended (but not strictly required) to include:
    - `baseline_request`: canonicalized **original request payload** used as baseline (for the first snapshot / representative case).
    - `candidate_request_preview`: **baseline_request + overrides** merged on the backend, provider-normalized, read-only; used only for UI comparison (left = baseline, right = candidate).
  - These two preview fields are **display-only** and must not be re-ingested as-is; replay execution should still derive the effective request from snapshots + overrides directly.

#### Execution

- **repeat_runs**: 1 / 10 / 50 / 100 (dropdown next to Run; 50/100 red-tinted + warning)
- Data source: node?s "Recommended set" is default (see below)

#### Case-level classification (strict default)

- When repeat_runs = N:
  - **PASS**: N/N attempts pass
  - **FAIL**: N/N fail
  - **FLAKY**: \(0 < passed\_runs < N\)

> This definition is always stated in result table / tooltip / summary report.
> Note: **If repeat_runs = 1, FLAKY does not occur** (always PASS or FAIL).

#### Gate verdict (release conclusion)

- Over the case set:
  - `fail_rate = (# FAIL cases) / total`
  - `flaky_rate = (# FLAKY cases) / total`
- **Strict gate (default)**
- **Strictness (run-time only; UI label "Strictness")**
  - Default: `fail_rate_max = 0.05`, `flaky_rate_max = 0.03`
  - Adjustable in UI ("this run only", not persisted). **UI display**: values in **%** (e.g. 5%, 3%); API/internal keep 0–1 decimal.
  - Presets: **Strict** (5% / 1%), **Normal** (5% / 3%), **Lenient** (10% / 5%), **Custom**. Fail % / Flaky % inputs shown only when Custom is selected; preset values in tooltips.

---

### Reference contract: "What is FAIL?" fixed as one (MVP)

This section is the **reference contract shared by docs / UX / API**. Data selection (Recommended) and release conclusion (Gate) must be consistent.

#### 1) Terminology

- **Check**: Live Eval signals stored in `eval_checks_result`. MVP supports exactly **11 checks**: empty, latency, status_code, refusal, json, length, repetition, required, format, leakage, tool. (Token/cost usage checks are out of scope.)
- **Policy**: Rules defined by `BehaviorRule` (e.g. forbidden tool, allowlist, args schema)
- **Case**: One input for Release Gate. In MVP **case = snapshot_id**.
- **Attempt**: One replay run result per case. If `repeat_runs=N`, there are N attempts per case.

#### 2) Data selection contract (Saved datasets / Live View logs)

- **Data selection is based on "user-defined dataset (playlist) + recent logs".**
  - From Live View, select snapshots into **node-scoped dataset (playlist)** and optionally append to existing dataset.
  - In Release Gate, use Saved datasets or Live View logs (Last N / custom selection) as data source.
- Recommended set (Worst 20 + Golden 20, last 7 days) is out of scope for MVP.
- **N/A policy (data selection)**:
  - `not_applicable` is **not** treated as FAIL (Neutral).
  - Snapshot list/status (e.g. empty/failed) may exclude from Worst/Golden selection via `eval_checks_result`.

#### 3) Gate verdict contract (Release Gate: Replay Test)

Release Gate "release conclusion" uses only the following two axes (MVP fixed).

- **(A) Replay execution error**
  - provider error / timeout / format error / model error ? that attempt is FAIL.
- **(B) Policy (BehaviorRule) violation**
  - Replay result is normalized to **canonical step**; steps are checked against `BehaviorRule` (provider-agnostic).
  - If violations ? 1, that attempt is FAIL.

> In MVP, `eval_checks_result` (Live Eval checks) are **not** directly reflected in Gate verdict (they are shown in result UI for reference only).

#### 4) Case / Gate FAIL definition (one-line)

- **Attempt FAIL**: Replay execution error **OR** Policy violation (= violations > 0)
  - **PASS**: N/N attempts pass
  - **FAIL**: N/N attempts fail
- **Gate PASS**: `fail_rate <= fail_rate_max` **AND** `flaky_rate <= flaky_rate_max`

#### 5) Evidence standard (minimal)

Each case must provide at least:

- **attempts[]**: per attempt `pass`, `failure_reasons` (replay_error / policy_violation), `violations` summary
- **top failed rules / sample failures**: so that users can see why FAIL

---

### Data selection spec (Saved datasets / Live View logs)

#### Principles

- Scoring / clustering / ML-based recommendation are out of scope for MVP.
- In practice, only snapshot sets (Saved datasets) and **recent logs (Last N / custom selection)** are used as Gate input.

#### Structure

- Live View:
  - From Clinical Log, select snapshots and save to **saved logs** (node-scoped pool), or group into a **dataset**.
  - Saved datasets are lists/groupings of snapshots.
  - In "Saved datasets" tab, load sets saved from Live View and select.
  - In "Live View logs", select Last 10/25/50/100 or custom selection for recent logs.

#### UI display

- Data source:
  - When from Saved datasets ? "Data source: Dataset(s)"
  - When from Live View logs (Last N / custom) ? "Data source: Live View logs"
  - Exact composition is defined in a later v2 spec.

---

### (v2 candidate) Curated Pool (Worst/Golden) + Retention/Cap (per plan)

- **Original snapshot storage (raw)** and **curation index (curated pool)** are separate.
- raw: full `Snapshot` (input/output/response + captured `eval_checks_result` + `eval_config_version`).
- curated pool: Worst/Golden selection with snapshot_id index.
- Worst/Golden selection is based on **snapshot-level** `eval_checks_result` (details TBD).
- curated pool has **per-plan cap** (e.g. per node); when over cap, **oldest entries rotate out** (details TBD).
- raw is governed by **plan-based retention** (e.g. time/size); if raw is deleted, Gate evidence/replay may be affected.
- Live View detail panel, per node: Curated Worst/Golden count, policy (FAIL/PASS, N/A neutral), Export/Copy (snapshot ID list).
- Release Gate data selection: use `Recommended (last 7 days)` plus `Curated Worst`, `Curated Golden` as data source; exact limits TBD in v2.

#### Plan-level policy (example, v2)

- **Curated pool cap**: Worst \(N\) / Golden \(M\) (per plan)
- **Raw snapshot retention**: \(X\) days or \(Y\) GB (per plan)
- **Display policy (reference)**: Release Gate UI shows snapshots subject to raw retention policy.

#### Release Gate history retention (MVP)

- Release Gate history is stored as `BehaviorReport` rows marked with `summary_json.release_gate`.
- Release Gate history follows the **same plan-based retention window as raw snapshots**:
  - Free: **7 days**
  - Pro: **30 days**
  - Enterprise: **365 days**
- `GET /projects/{project_id}/release-gate/history` returns only rows within the active retention window and may include `retention_days` for UI copy.
- Expired Release Gate history is **hard-deleted** by the scheduled data lifecycle cleanup job.
- **Safety rule**: Only rows marked as release-gate history are deleted. General Behavior reports remain untouched.

---

### Result/Report (Delta-focused minimal report)

MVP result screen should be the "minimal unit for the team to make a release decision".

- **Gate verdict**: PASS/FAIL + criteria (`fail<=X%, flaky<=Y%`)
- **Summary**
  - fail_rate, flaky_rate
- **Representative evidence**
  - top failed rules (or top failing eval elements)
  - Sample failing cases (e.g. 3?5)
- **Export**
  - Export JSON or Copy summary (at least one)

---

### Drift conclusion (MVP)

- Drift is **out of scope** for MVP.
- "Original config ? Replay Test run once" is the supported flow for MVP.
- Drift is deferred to v2 (e.g. Eval policy and historical log comparison).

---

### Onboarding / Integration spec (MVP)

#### Goal

- User gets a "data flowing within 5 minutes" experience.

#### Ingestion API (existing)

- `POST /projects/{project_id}/snapshots`
- Minimum fields: (see existing docs)
- Recommended: `agent_id`, `status_code`, `latency_ms` (optional), tool_calls etc.

#### Examples

- curl example (one)
- Node/Python copy-paste example (one each)
- Recommended fields and check format: (see existing docs)

---

### Implementation principles (code quality / cleanup)

- When adding features, **remove unnecessary code/docs** immediately (if inconsistent with feature/spec, mark for deletion).
- Testing follows spec first + security/UX as delta.
- In code, keep:
  - Security-first stance
  - Test/coverage where feasible

---

### Pending decisions (to be confirmed)

These items are **confirmed** for MVP implementation.

- Gate threshold default: **fail_rate_max=0.05**, **flaky_rate_max=0.03** (run-time tuning, presets provided).
- Baseline/Delta policy (MVP): **baseline is not custom; it is fixed.**
  - Gate verdict is determined only by Replay Test result PASS/FAIL/FLAKY counts.
  - Comparison/reference (baseline vs run) for delta display is deferred to v2.

---

### Implementation checklist (reliability / consistency)

#### Clinical Log immutability (materialize)

So that past logs in Live View do not "change when viewed later" due to policy changes, capture-time evaluation results must be **materialized** on the snapshot.

- When saving snapshot:
  - Persist case check result (`eval_checks_result`).
  - Persist result with reference policy version (`eval_config_version`).
- In UI:
  - Use stored `eval_checks_result` (do not re-run policy on load).
  - When needed, compare with `eval_config_version` for display.
