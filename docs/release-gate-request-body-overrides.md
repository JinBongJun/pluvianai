# Release Gate: request body overrides

## Purpose

Baseline logs may omit or corrupt **non–user-text** parts of the provider request (attachments, RAG blobs, custom keys). Release Gate settings include optional **additional request body fields** merged into `replay_overrides` **after** the configuration JSON. You can also set **per-log** fields: the validate API accepts `replay_overrides_by_snapshot_id` (map of snapshot id → JSON object). The worker merges **`replay_overrides` first**, then the object for that snapshot id (per-log keys win on conflict).

## Rules

- **Shared** fields are merged into `replay_overrides` sent to the validate API, then shallow-merged into the replay request body in `replay_service.replay_snapshot` (same as other override keys).
- **Per-log** fields are merged **after** shared fields for that snapshot only (`run_batch_replay` in `replay_service`).
- **Overrides win** over the same key coming from config-only `requestBody` / tools merge.
- **Never** supply conversation or trace fields via overrides; they are stripped client- and server-side:
  - `messages`, `message`, `user_message`, `response`, `responses`, `input`, `inputs`, `trace_id`, `agent_id`, `agent_name`
- **User / assistant text** for the run remains from the **snapshot**, not from overrides.
- **`null`** for a key in the override object removes that key from the merged request (same semantics as `replay_service` for overrides).

## Typical keys

Examples (schema varies by app): `attachments`, `documents`, `context`, `retrieved_chunks`, `sources`, `rag_context`. Use JSON that matches your provider request shape at the **top level** of the replay body.

## Alignment

- Frontend: `frontend/.../release-gate/releaseGateReplayMerge.ts` (`DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS`; deprecated alias `DISALLOWED_REPLAY_SUPPLEMENT_KEYS`).
- Backend: `DISALLOWED_REPLAY_OVERRIDE_KEYS` and `_sanitize_replay_overrides` in `app/api/v1/endpoints/release_gate.py`.

When adding or renaming disallowed keys, update **both** places and this doc.

## Result UI

Each run returns **`replay_request_meta`** on the validate/job result and stores the same object under **`summary_json.release_gate.replay_request_meta`** on the behavior report.

- **`baseline_snapshot_excerpt`**: for each key in `replay_overrides_applied`, the value from the **first baseline snapshot’s** request body (or `null` if missing).
- **`replay_overrides_applied`**: sanitized global overrides sent to replay.
- **`replay_overrides_by_snapshot_id_applied`**: sanitized per-snapshot override objects (when provided).
- **`sampling_overrides`**, **`has_new_system_prompt`**, **`new_system_prompt_preview`**: other replay parameters.

The Release Gate **Results** side panel shows a **Baseline vs Applied** comparison when any of these are present.
