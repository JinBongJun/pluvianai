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

function sortDeep(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortDeep);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    sorted[k] = sortDeep(obj[k]);
  }
  return sorted;
}

/** Structural equality for JSON-like override values (key order independent). */
export function replayOverrideValuesEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b));
  } catch {
    return false;
  }
}

/**
 * Drop per-snapshot keys that duplicate the shared override value so the UI only shows diffs.
 * Merge behavior unchanged: missing key in per still inherits shared.
 */
export function stripPerSnapshotOverridesDuplicatingShared(
  shared: Record<string, unknown>,
  per: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(per)) {
    if (!Object.prototype.hasOwnProperty.call(shared, k)) {
      out[k] = v;
      continue;
    }
    if (replayOverrideValuesEqual(v, shared[k])) continue;
    out[k] = v;
  }
  return out;
}

/** @deprecated Use DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS */
export const DISALLOWED_REPLAY_SUPPLEMENT_KEYS = DISALLOWED_REPLAY_BODY_OVERRIDE_KEYS;

/** @deprecated Use sanitizeReplayBodyOverrides */
export const sanitizeReplayRequestSupplement = sanitizeReplayBodyOverrides;

/** @deprecated Use applyBodyOverridesToRequestBody */
export const applySupplementToRequestBody = applyBodyOverridesToRequestBody;

/** @deprecated Use mergeReplayBodyOverridesForSnapshot */
export const mergeReplaySupplementsForSnapshot = mergeReplayBodyOverridesForSnapshot;
