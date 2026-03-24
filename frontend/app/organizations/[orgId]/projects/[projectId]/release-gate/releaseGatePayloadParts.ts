import { sanitizeReplayBodyOverrides } from "./releaseGateReplayMerge";

export function extractOverridesFromPayload(
  payload: Record<string, unknown> | null
): Record<string, unknown> {
  if (!payload) return {};
  const clone = { ...payload };
  // Keep replay-overridable request knobs only; exclude prompt/body bulk fields.
  delete clone.model;
  delete clone.messages;
  delete clone.tools;
  delete clone.stream;
  delete clone.temperature;
  delete clone.max_tokens;
  delete clone.top_p;
  return clone;
}

export function asPayloadObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** When payload is { request, response }, return the request part; else return payload. */
export function getRequestPart(payload: Record<string, unknown> | null): Record<string, unknown> {
  if (!payload) return {};
  if (payload.request && typeof payload.request === "object" && !Array.isArray(payload.request))
    return payload.request as Record<string, unknown>;
  return payload;
}

/** Derive eval pass/fail from snapshot (eval_checks_result or is_worst). */
export function snapshotEvalFailed(snap: Record<string, unknown> | null): boolean {
  if (!snap) return false;
  const checks = snap.eval_checks_result;
  if (checks && typeof checks === "object" && !Array.isArray(checks)) {
    const vals = Object.values(checks);
    if (vals.some(v => v === "fail")) return true;
  }
  return Boolean(snap.is_worst);
}

export function sanitizePayloadForPreview(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const base =
    src.request && typeof src.request === "object" && !Array.isArray(src.request)
      ? (src.request as Record<string, unknown>)
      : src;
  const clone = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
  delete (clone as any).model;
  delete (clone as any).messages;
  delete (clone as any).message;
  delete (clone as any).user_message;
  delete (clone as any).response;
  delete (clone as any).responses;
  delete (clone as any).input;
  delete (clone as any).inputs;
  delete (clone as any).trace_id;
  delete (clone as any).agent_id;
  delete (clone as any).agent_name;
  return clone;
}

/** Request body for replay: same as payload but without model (model is UI-only) and without snapshot content. */
export function payloadWithoutModel(payload: Record<string, unknown> | null): Record<string, unknown> {
  const part = getRequestPart(payload);
  if (!Object.keys(part).length) return {};
  const clone = JSON.parse(JSON.stringify(part)) as Record<string, unknown>;
  delete clone.model;
  // JSON payload in Release Gate should only contain configuration, not per-snapshot
  // content such as messages or responses. These are always taken from snapshots.
  delete (clone as any).messages;
  delete (clone as any).message;
  delete (clone as any).user_message;
  delete (clone as any).response;
  delete (clone as any).responses;
  delete (clone as any).input;
  delete (clone as any).inputs;
  delete (clone as any).trace_id;
  delete (clone as any).agent_id;
  delete (clone as any).agent_name;
  return clone;
}

/**
 * Core Release Gate `requestBody` from the representative snapshot: same as
 * {@link payloadWithoutModel}, but drops any key also placed in shared extra
 * request JSON ({@link extractOverridesFromPayload} + sanitize) so overrides
 * are not duplicated in the config textarea.
 */
export function releaseGateCoreRequestBodyFromBaseline(
  baselinePayload: Record<string, unknown> | null
): Record<string, unknown> {
  if (!baselinePayload) return {};
  const raw = payloadWithoutModel(baselinePayload);
  const seedShared = sanitizeReplayBodyOverrides(extractOverridesFromPayload(baselinePayload));
  if (Object.keys(seedShared).length === 0) return raw;
  const out: Record<string, unknown> = { ...raw };
  for (const k of Object.keys(seedShared)) {
    delete out[k];
  }
  return out;
}

/** JSON editor view for candidate config: config-only and tools-free. */
export function editableRequestBodyWithoutTools(
  body: Record<string, unknown> | null
): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const clone = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  delete clone.model;
  delete clone.tools;
  delete (clone as any).system_prompt;
  delete (clone as any).messages;
  delete (clone as any).message;
  delete (clone as any).user_message;
  delete (clone as any).response;
  delete (clone as any).responses;
  delete (clone as any).input;
  delete (clone as any).inputs;
  delete (clone as any).trace_id;
  delete (clone as any).agent_id;
  delete (clone as any).agent_name;
  return clone;
}

/** Apply system prompt text to request body (top-level and messages if present). */
export function applySystemPromptToBody(
  body: Record<string, unknown>,
  systemPrompt: string
): Record<string, unknown> {
  const next = { ...body };
  next.system_prompt = systemPrompt || undefined;
  const msgs = next.messages;
  if (Array.isArray(msgs)) {
    let found = false;
    const nextMsgs = msgs.map((msg: unknown) => {
      if (!msg || typeof msg !== "object") return msg;
      const m = { ...(msg as Record<string, unknown>) };
      if (m.role === "system") {
        found = true;
        m.content = systemPrompt;
      }
      return m;
    });
    if (!found && systemPrompt) nextMsgs.unshift({ role: "system", content: systemPrompt });
    next.messages = nextMsgs;
  }
  return next;
}

export function extractSystemPromptFromPayload(payload: Record<string, unknown> | null): string {
  if (!payload) return "";
  const direct = payload.system_prompt;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const msgs = payload.messages;
  if (!Array.isArray(msgs)) return "";
  for (const msg of msgs) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    if (m.role !== "system") continue;
    const content = m.content;
    if (typeof content === "string" && content.trim()) return content.trim();
  }
  return "";
}
