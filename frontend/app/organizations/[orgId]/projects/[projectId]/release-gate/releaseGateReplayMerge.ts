/**
 * Merge rules for Release Gate replay_overrides / request supplements.
 * Must stay aligned with backend DISALLOWED_REPLAY_OVERRIDE_KEYS in
 * app/api/v1/endpoints/release_gate.py
 */
export const DISALLOWED_REPLAY_SUPPLEMENT_KEYS = new Set([
  "messages",
  "message",
  "user_message",
  "response",
  "responses",
  "input",
  "inputs",
  "trace_id",
  "agent_id",
  "agent_name",
]);

/**
 * Remove keys that must not be supplied via supplements (conversation + trace).
 */
export function sanitizeReplayRequestSupplement(
  obj: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DISALLOWED_REPLAY_SUPPLEMENT_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Merge supplement into a request body copy. `null` values remove keys (same as replay_service).
 */
export function applySupplementToRequestBody(
  target: Record<string, unknown>,
  supplement: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...target };
  for (const [k, v] of Object.entries(supplement)) {
    if (DISALLOWED_REPLAY_SUPPLEMENT_KEYS.has(k)) continue;
    if (v === null) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }
  return next;
}
