import type { ReleaseGateResult, ToolContextPayload } from "@/lib/api";
import {
  applyBodyOverridesToRequestBody,
  mergeReplayBodyOverridesForSnapshot,
  sanitizeReplayBodyOverrides,
} from "./releaseGateReplayMerge";

export type EditableTool = {
  id: string;
  name: string;
  description: string;
  parameters: string;
};
export type GateThresholds = { failRateMax: number; flakyRateMax: number };
export type { HistoryDatePreset } from "./releaseGateHistoryDateRange";
export { getPresetHistoryDateRange } from "./releaseGateHistoryDateRange";
export type ReplayProvider = "openai" | "anthropic" | "google";

export const RECENT_SNAPSHOT_LIMIT = 100;
export const BASELINE_SNAPSHOT_LIMIT = 200;
/** Stable fallback for SWR `data?.items` — inline `[]` is a new reference each render and breaks useMemo/useEffect dependencies. */
export const EMPTY_SWF_ITEMS: never[] = [];
export const REPLAY_PROVIDER_LABEL: Record<ReplayProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};
export const DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY: Record<ReplayProvider, string[]> = {
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini",
  ],
  anthropic: [
    // Keep conservative, pinned IDs for reproducible Release Gate runs.
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-20250514",
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ],
};
export const REPLAY_THRESHOLD_PRESETS = {
  strict: {
    label: "Strict",
    failRateMax: 0.05,
    flakyRateMax: 0.01,
  },
  default: {
    label: "Normal",
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
  lenient: {
    label: "Lenient",
    failRateMax: 0.1,
    flakyRateMax: 0.05,
  },
  custom: {
    label: "Custom",
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
} as const;

export type ThresholdPreset = keyof typeof REPLAY_THRESHOLD_PRESETS;

/** Provider-level default knobs for replay when no snapshot payload exists or has no config. */
export const PROVIDER_PAYLOAD_TEMPLATES: Record<ReplayProvider, Record<string, unknown>> = {
  openai: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 512,
  },
  anthropic: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 1024,
  },
  google: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 512,
  },
};

export function clampRate(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function normalizeGateThresholds(failRateMax: unknown, flakyRateMax: unknown): GateThresholds {
  return {
    failRateMax: clampRate(failRateMax, REPLAY_THRESHOLD_PRESETS.default.failRateMax),
    flakyRateMax: clampRate(flakyRateMax, REPLAY_THRESHOLD_PRESETS.default.flakyRateMax),
  };
}

export function parseSnapshotCreatedAtMs(snapshot: Record<string, unknown> | null | undefined): number {
  if (!snapshot) return 0;
  const raw = snapshot.created_at;
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function snapshotNumericId(snapshot: Record<string, unknown>): number {
  const id = snapshot?.id;
  if (typeof id === "number" && Number.isFinite(id)) return id;
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

export function compareSnapshotsNewestFirst(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const ta = parseSnapshotCreatedAtMs(a);
  const tb = parseSnapshotCreatedAtMs(b);
  if (tb !== ta) return tb - ta;
  return snapshotNumericId(b) - snapshotNumericId(a);
}

export function pickNewestSnapshot(snapshots: Record<string, unknown>[]): Record<string, unknown> | null {
  if (!snapshots.length) return null;
  return [...snapshots].sort(compareSnapshotsNewestFirst)[0] ?? null;
}

export function normalizeReplayProvider(raw: unknown): ReplayProvider | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "openai" || value === "anthropic" || value === "google") return value;
  return null;
}

export function inferProviderFromModelId(modelId: unknown): ReplayProvider | null {
  const model = String(modelId ?? "")
    .trim()
    .toLowerCase();
  if (!model) return null;
  if (
    model.startsWith("gpt") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.startsWith("text-embedding") ||
    model.startsWith("openai/")
  ) {
    return "openai";
  }
  if (model.includes("claude") || model.startsWith("anthropic/")) return "anthropic";
  if (
    model.includes("gemini") ||
    model.includes("google") ||
    model.startsWith("models/gemini") ||
    model.startsWith("google/")
  ) {
    return "google";
  }
  return null;
}

export function validateCustomModelForProvider(
  provider: ReplayProvider,
  modelId: string
): { ok: true } | { ok: false; message: string } {
  const trimmed = String(modelId ?? "").trim();
  if (!trimmed) return { ok: false, message: "Model id is required." };
  const inferred = inferProviderFromModelId(trimmed);
  if (inferred && inferred !== provider) {
    return {
      ok: false,
      message: `Run blocked: model "${trimmed}" looks like ${REPLAY_PROVIDER_LABEL[inferred]}, but provider is set to ${REPLAY_PROVIDER_LABEL[provider]}.`,
    };
  }
  return { ok: true };
}

export function describeMissingProviderKeys(missingProviders: ReplayProvider[]): string {
  if (missingProviders.length === 0) return "";
  const labels = missingProviders.map(p => REPLAY_PROVIDER_LABEL[p]).join(", ");
  return `Run blocked: ${labels} API key is not registered for the selected agent (or project default). Open Live View, click the agent, then register the key in the Settings tab.`;
}

export function extractToolsFromPayload(payload: Record<string, unknown> | null): EditableTool[] {
  if (!payload) return [];
  const rawTools = payload.tools;
  if (!Array.isArray(rawTools)) return [];
  const out: EditableTool[] = [];
  for (const item of rawTools) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fnRaw = obj.function;
    const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
    const name = String(fn.name ?? obj.name ?? "").trim();
    if (!name) continue;
    const description =
      typeof fn.description === "string"
        ? fn.description
        : typeof obj.description === "string"
          ? obj.description
          : "";
    const paramsObj =
      fn.parameters && typeof fn.parameters === "object"
        ? fn.parameters
        : obj.parameters && typeof obj.parameters === "object"
          ? obj.parameters
          : null;
    out.push({
      id: crypto.randomUUID(),
      name,
      description,
      parameters: paramsObj ? JSON.stringify(paramsObj, null, 2) : "{}",
    });
  }
  return out;
}

export function extractToolResultTextFromSnapshotRecord(snapshot: Record<string, unknown>): string {
  const payload = snapshot.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const raw = (payload as Record<string, unknown>).tool_events;
  if (!Array.isArray(raw)) return "";
  const parts: string[] = [];
  for (const ev of raw) {
    if (!ev || typeof ev !== "object") continue;
    const row = ev as Record<string, unknown>;
    if (String(row.kind || "").toLowerCase() !== "tool_result") continue;
    const out = row.output;
    if (typeof out === "string") parts.push(out);
    else if (out != null) {
      try {
        parts.push(JSON.stringify(out, null, 2));
      } catch {
        parts.push(String(out));
      }
    }
  }
  return parts.join("\n\n---\n\n");
}

export function buildToolContextPayload(
  mode: "recorded" | "inject",
  scope: "global" | "per_snapshot",
  globalText: string,
  bySnapshotId: Record<string, string>
): ToolContextPayload {
  if (mode === "recorded") return { mode: "recorded" };
  const inject: {
    scope: "per_snapshot" | "global";
    global_text?: string;
    by_snapshot_id?: Record<string, string>;
  } = { scope };
  const gt = globalText.trim();
  if (gt) inject.global_text = gt;
  if (scope === "per_snapshot") {
    const by: Record<string, string> = {};
    for (const [k, v] of Object.entries(bySnapshotId)) {
      if (v.trim()) by[k] = v.trim();
    }
    if (Object.keys(by).length) inject.by_snapshot_id = by;
  }
  return { mode: "inject", inject };
}

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

export function buildFinalCandidateRequest(options: {
  baselineSeedSnapshot: Record<string, unknown> | null;
  baselinePayload: Record<string, unknown> | null;
  nodeBasePayload: Record<string, unknown> | null;
  requestBody: Record<string, unknown>;
  requestSystemPrompt: string;
  modelOverrideEnabled: boolean;
  newModel: string;
  /** Merged after requestBody; wins on conflict. Does not replace messages/user text (sanitized). */
  requestBodyOverrides?: Record<string, unknown> | null;
  /** Per selected snapshot ids; merged after global for the seed snapshot preview. */
  requestBodyOverridesBySnapshotId?: Record<string, Record<string, unknown>> | null;
  /** First baseline snapshot id (for merged body-overrides preview). */
  seedSnapshotId?: string | null;
}): Record<string, unknown> {
  const {
    baselineSeedSnapshot,
    baselinePayload,
    nodeBasePayload,
    requestBody,
    requestSystemPrompt,
    modelOverrideEnabled,
    newModel,
    requestBodyOverrides,
    requestBodyOverridesBySnapshotId,
    seedSnapshotId,
  } = options;

  const baseFromSnapshot = asPayloadObject(baselineSeedSnapshot?.payload);
  const baseRequest = baseFromSnapshot
    ? getRequestPart(baseFromSnapshot)
    : baselinePayload || nodeBasePayload || {};

  let finalReq: Record<string, unknown> = JSON.parse(JSON.stringify(baseRequest || {}));

  if (modelOverrideEnabled && newModel.trim()) {
    finalReq.model = newModel.trim();
  }

  const trimmedPrompt = requestSystemPrompt.trim();
  if (trimmedPrompt) {
    finalReq = applySystemPromptToBody(finalReq, trimmedPrompt);
  }

  if (typeof requestBody.temperature === "number") {
    finalReq.temperature = requestBody.temperature;
  }
  if (typeof requestBody.max_tokens === "number") {
    finalReq.max_tokens = requestBody.max_tokens;
  }
  if (typeof requestBody.top_p === "number") {
    finalReq.top_p = requestBody.top_p;
  }

  for (const [k, v] of Object.entries(requestBody)) {
    if (
      k === "model" ||
      k === "system_prompt" ||
      k === "messages" ||
      k === "message" ||
      k === "user_message" ||
      k === "response" ||
      k === "responses" ||
      k === "input" ||
      k === "inputs" ||
      k === "trace_id" ||
      k === "agent_id" ||
      k === "agent_name"
    ) {
      continue;
    }
    finalReq[k] = v;
  }

  const mergedSup = mergeReplayBodyOverridesForSnapshot(
    requestBodyOverrides ?? undefined,
    requestBodyOverridesBySnapshotId ?? undefined,
    seedSnapshotId ?? null
  );
  if (Object.keys(mergedSup).length > 0) {
    finalReq = applyBodyOverridesToRequestBody(finalReq, mergedSup);
  }

  return finalReq;
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

function firstUserMessageSnippetFromRequest(req: Record<string, unknown> | null, maxLen = 72): string {
  if (!req) return "";
  const msgs = req.messages;
  if (!Array.isArray(msgs)) return "";
  for (const msg of msgs) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    const role = String(m.role || "").toLowerCase();
    if (role !== "user" && role !== "human") continue;
    const c = m.content;
    let text = "";
    if (typeof c === "string") text = c;
    else if (Array.isArray(c)) {
      const parts: string[] = [];
      for (const part of c) {
        if (typeof part === "string") parts.push(part);
        else if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") parts.push(p.text);
        }
      }
      text = parts.join(" ");
    }
    const t = text.replace(/\s+/g, " ").trim();
    if (!t) continue;
    return t.length > maxLen ? `${t.slice(0, maxLen)}…` : t;
  }
  return "";
}

/**
 * Human-readable primary line + stable id line for per-log Release Gate editors.
 */
export function formatSnapshotShortLabel(
  snapshotId: string,
  record: Record<string, unknown> | undefined
): { primary: string; idLine: string } {
  const idLine = `Snapshot id ${snapshotId}`;
  if (!record) {
    return { primary: `Log #${snapshotId}`, idLine };
  }
  const createdMs = parseSnapshotCreatedAtMs(record);
  const timePart =
    createdMs > 0
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
          new Date(createdMs)
        )
      : "";
  const rawPayload = asPayloadObject(record.payload);
  const req = rawPayload ? getRequestPart(rawPayload) : null;
  const snippet = firstUserMessageSnippetFromRequest(req, 72);
  const parts: string[] = [];
  if (timePart) parts.push(timePart);
  if (snippet) parts.push(`“${snippet}”`);
  const primary = parts.length > 0 ? parts.join(" · ") : `Log #${snapshotId}`;
  return { primary, idLine };
}

export function buildBaselineConfigSummary(payload: Record<string, unknown> | null): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const obj = payload as Record<string, unknown>;
  const parts: string[] = [];

  const temp = obj.temperature;
  if (typeof temp === "number" && Number.isFinite(temp)) {
    parts.push(`Temp ${temp}`);
  }

  const maxTok = obj.max_tokens;
  if (
    maxTok != null &&
    (typeof maxTok === "number"
      ? Number.isInteger(maxTok)
      : Number.isInteger(Number(maxTok))) &&
    Number(maxTok) > 0
  ) {
    parts.push(`Max ${Number(maxTok)}`);
  }

  const topP = obj.top_p;
  if (typeof topP === "number" && Number.isFinite(topP)) {
    parts.push(`Top p ${topP}`);
  }

  const tools = obj.tools;
  if (Array.isArray(tools) && tools.length > 0) {
    const names: string[] = [];
    for (const t of tools) {
      if (!t || typeof t !== "object") continue;
      const tool = t as Record<string, unknown>;
      const fnRaw = tool.function;
      const fn = fnRaw && typeof fnRaw === "object" ? (fnRaw as Record<string, unknown>) : {};
      const name = String(fn.name ?? tool.name ?? "").trim();
      if (name) names.push(name);
    }
    if (names.length > 0) {
      const previewNames = names.slice(0, 3).join(", ");
      const suffix = names.length > 3 ? `, +${names.length - 3}` : "";
      parts.push(`Tools ${names.length}개 (${previewNames}${suffix})`);
    } else {
      parts.push(`Tools ${tools.length}개`);
    }
  }

  return parts.join(" · ");
}

/** Full list so Release Gate shows all check types from saved config (matches backend CHECK_KEYS order). */
export const LIVE_VIEW_CHECK_ORDER = [
  "empty",
  "latency",
  "status_code",
  "refusal",
  "json",
  "length",
  "repetition",
  "required",
  "format",
  "leakage",
  "tool",
] as const;

/** Defaults for each check so missing keys in old saved config still appear. */
export const DEFAULT_EVAL_CHECK_VALUE: Record<string, { enabled: boolean }> = {
  empty: { enabled: true },
  latency: { enabled: true },
  status_code: { enabled: true },
  refusal: { enabled: true },
  json: { enabled: true },
  length: { enabled: true },
  repetition: { enabled: true },
  required: { enabled: false },
  format: { enabled: false },
  leakage: { enabled: false },
  tool: { enabled: true },
};

export function shouldShowEvalSetting(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const obj = value as Record<string, unknown>;
  if (typeof obj.enabled === "boolean") return obj.enabled;
  return true;
}
