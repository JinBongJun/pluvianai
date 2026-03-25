import type { LiveViewRequestOverview, RequestContextMeta } from "@/lib/api/live-view";

const EXTENDED_CONTEXT_KEYS = [
  "context",
  "retrieved_chunks",
  "documents",
  "attachments",
  "rag_context",
  "sources",
] as const;

const REQUEST_CONTROL_KEYS = [
  "temperature",
  "top_p",
  "max_tokens",
  "tool_choice",
  "response_format",
  "stream",
  "metadata",
  "seed",
  "presence_penalty",
  "frequency_penalty",
  "parallel_tool_calls",
] as const;

const EXTENDED_CONTEXT_KEY_SET = new Set<string>(EXTENDED_CONTEXT_KEYS);
const REQUEST_CONTROL_KEY_SET = new Set<string>(REQUEST_CONTROL_KEYS);

const EXCLUDED_ADDITIONAL_KEYS = new Set([
  "provider",
  "model",
  "messages",
  "message",
  "user_message",
  "response",
  "responses",
  "input",
  "inputs",
  "system",
  "system_prompt",
  "temperature",
  "top_p",
  "max_tokens",
  "tool_choice",
  "tools",
  "response_format",
  "stream",
  "metadata",
  "trace_id",
  "agent_id",
  "agent_name",
]);

export type NodeRequestOverview = {
  provider: string;
  model: string;
  messageCount: number;
  toolsCount: number;
  temperature: number | null;
  topP: number | null;
  maxTokens: number | null;
  requestControlKeys: string[];
  extendedContextKeys: string[];
  additionalRequestKeys: string[];
  omittedByPolicy: boolean;
  truncated: boolean;
};

export type RequestFieldEntry = {
  key: string;
  value: unknown;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getRequestObject(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  const request = asObject(payload.request);
  if (request) return request;
  const requestData = asObject(payload.request_data);
  if (requestData) return requestData;
  return payload;
}

function dedupeStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>();
  for (const value of Array.from(values)) {
    const trimmed = String(value || "").trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
}

function maybeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function maybeArrayOfStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return entries.length > 0 ? Array.from(new Set(entries)) : [];
}

function collectExtendedContextKeys(
  payload: Record<string, unknown> | null,
  request: Record<string, unknown> | null
) {
  const keys = new Set<string>();
  for (const source of [payload, request]) {
    if (!source) continue;
    for (const key of EXTENDED_CONTEXT_KEYS) {
      if (source[key] != null && source[key] !== "") {
        keys.add(key);
      }
    }
  }
  return Array.from(keys);
}

function collectAdditionalRequestKeys(request: Record<string, unknown> | null) {
  return collectAdditionalRequestEntries(request).map(entry => entry.key);
}

export function collectRequestControlEntries(request: Record<string, unknown> | null): RequestFieldEntry[] {
  if (!request) return [];
  return REQUEST_CONTROL_KEYS.filter(key => request[key] != null && request[key] !== "").map(key => ({
    key,
    value: request[key],
  }));
}

export function collectAdditionalRequestEntries(
  request: Record<string, unknown> | null
): RequestFieldEntry[] {
  if (!request) return [];
  return dedupeStrings(
    Object.keys(request).filter(key => {
      if (EXCLUDED_ADDITIONAL_KEYS.has(key)) return false;
      if (REQUEST_CONTROL_KEY_SET.has(key)) return false;
      if (EXTENDED_CONTEXT_KEY_SET.has(key)) return false;
      const value = request[key];
      return value != null && value !== "";
    })
  ).map(key => ({
    key,
    value: request[key],
  }));
}

function countTools(request: Record<string, unknown> | null) {
  if (!request) return 0;
  const tools = request.tools;
  if (Array.isArray(tools)) return tools.length;
  return 0;
}

function countMessages(request: Record<string, unknown> | null) {
  if (!request) return 0;
  const messages = request.messages;
  if (Array.isArray(messages)) return messages.length;
  return 0;
}

export function buildNodeRequestOverview(options: {
  payload: Record<string, unknown> | null | undefined;
  provider?: unknown;
  model?: unknown;
  requestContextMeta?: RequestContextMeta | null;
  serverRequestOverview?: LiveViewRequestOverview | null;
}): NodeRequestOverview {
  const payload = options.payload ?? null;
  const request = getRequestObject(payload);
  const requestContextMeta = options.requestContextMeta ?? null;
  const serverOverview = options.serverRequestOverview ?? null;

  const omittedByMarker =
    requestContextMeta?.omitted_by_policy === true ||
    Boolean(request?.["_pluvianai_message_bodies_omitted"]) ||
    Boolean(payload?.["_pluvianai_message_bodies_omitted"]);
  const truncatedByMarker =
    requestContextMeta?.truncated === true ||
    Boolean(request?.["_pluvianai_truncated"]) ||
    Boolean(payload?.["_pluvianai_truncated"]);

  const fallbackModel =
    typeof options.model === "string" && options.model.trim()
      ? options.model.trim()
      : typeof request?.model === "string" && request.model.trim()
        ? request.model.trim()
        : "Not detected";

  const fallbackProvider =
    typeof options.provider === "string" && options.provider.trim()
      ? options.provider.trim()
      : "Not detected";

  const localOverview: NodeRequestOverview = {
    provider: fallbackProvider,
    model: fallbackModel,
    messageCount: countMessages(request),
    toolsCount: countTools(request),
    temperature: maybeNumber(request?.temperature),
    topP: maybeNumber(request?.top_p),
    maxTokens: maybeNumber(request?.max_tokens),
    requestControlKeys: collectRequestControlEntries(request).map(entry => entry.key),
    extendedContextKeys: collectExtendedContextKeys(payload, request),
    additionalRequestKeys: collectAdditionalRequestKeys(request),
    omittedByPolicy: omittedByMarker,
    truncated: truncatedByMarker,
  };

  if (!serverOverview) return localOverview;

  return {
    provider:
      typeof serverOverview.provider === "string" && serverOverview.provider.trim()
        ? serverOverview.provider.trim()
        : localOverview.provider,
    model:
      typeof serverOverview.model === "string" && serverOverview.model.trim()
        ? serverOverview.model.trim()
        : localOverview.model,
    messageCount:
      typeof serverOverview.message_count === "number" && Number.isFinite(serverOverview.message_count)
        ? serverOverview.message_count
        : localOverview.messageCount,
    toolsCount:
      typeof serverOverview.tools_count === "number" && Number.isFinite(serverOverview.tools_count)
        ? serverOverview.tools_count
        : localOverview.toolsCount,
    temperature:
      maybeNumber(serverOverview.temperature) != null
        ? maybeNumber(serverOverview.temperature)
        : localOverview.temperature,
    topP: maybeNumber(serverOverview.top_p) != null ? maybeNumber(serverOverview.top_p) : localOverview.topP,
    maxTokens:
      maybeNumber(serverOverview.max_tokens) != null
        ? maybeNumber(serverOverview.max_tokens)
        : localOverview.maxTokens,
    requestControlKeys:
      maybeArrayOfStrings(serverOverview.request_control_keys) ?? localOverview.requestControlKeys,
    extendedContextKeys:
      maybeArrayOfStrings(serverOverview.extended_context_keys) ?? localOverview.extendedContextKeys,
    additionalRequestKeys:
      maybeArrayOfStrings(serverOverview.additional_request_keys) ?? localOverview.additionalRequestKeys,
    omittedByPolicy:
      serverOverview.omitted_by_policy === true ? true : localOverview.omittedByPolicy,
    truncated: serverOverview.truncated === true ? true : localOverview.truncated,
  };
}
