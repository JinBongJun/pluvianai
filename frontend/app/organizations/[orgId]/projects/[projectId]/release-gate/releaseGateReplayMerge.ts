/**
 * Merge rules for Release Gate `replay_overrides` (additional request body fields).
 * Must stay aligned with backend DISALLOWED_REPLAY_OVERRIDE_KEYS in
 * app/api/v1/endpoints/release_gate.py
 */
export const DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS = new Set([
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
 * Remove keys that must not be supplied via body overrides (conversation + trace).
 */
export function sanitizeReplayBodyOverrides(
  obj: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Merge body overrides into a request body copy. `null` values remove keys (same as replay_service).
 */
export function applyBodyOverridesToRequestBody(
  target: Record<string, unknown>,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...target };
  for (const [k, v] of Object.entries(overrides)) {
    if (DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS.has(k)) continue;
    if (v === null) {
      delete next[k];
    } else {
      next[k] = v;
    }
  }
  return next;
}

/**
 * Global overrides merged first, then per-snapshot (same key order as backend batch replay).
 */
export function mergeReplayBodyOverridesForSnapshot(
  globalOverrides: Record<string, unknown> | null | undefined,
  perBySnapshotId: Record<string, Record<string, unknown>> | null | undefined,
  snapshotId: string | null | undefined
): Record<string, unknown> {
  const g = sanitizeReplayBodyOverrides(globalOverrides);
  const sid = snapshotId?.trim();
  if (!sid) return g;
  const p = sanitizeReplayBodyOverrides(perBySnapshotId?.[sid]);
  if (Object.keys(p).length === 0) return g;
  return { ...g, ...p };
}

/** @deprecated Use DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS */
export const DISALLOWED_REPLAY_SUPPLEMENT_KEYS = DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS;

/** @deprecated Use sanitizeReplayBodyOverrides */
export const sanitizeReplayRequestSupplement = sanitizeReplayBodyOverrides;

/** @deprecated Use applyBodyOverridesToRequestBody */
export const applySupplementToRequestBody = applyBodyOverridesToRequestBody;

/** @deprecated Use mergeReplayBodyOverridesForSnapshot */
export const mergeReplaySupplementsForSnapshot = mergeReplayBodyOverridesForSnapshot;
