import type { RequestContextMeta } from "@/lib/api/live-view";

const EXTENDED_CONTEXT_KEYS = [
  "context",
  "retrieved_chunks",
  "documents",
  "attachments",
  "rag_context",
  "sources",
] as const;

const EXCLUDED_ADDITIONAL_KEYS = new Set([
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
  extendedContextKeys: string[];
  additionalRequestKeys: string[];
  omittedByPolicy: boolean;
  truncated: boolean;
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
  if (!request) return [];
  const keys = Object.keys(request).filter(key => {
    if (EXCLUDED_ADDITIONAL_KEYS.has(key)) return false;
    const value = request[key];
    return value != null && value !== "";
  });
  return dedupeStrings(keys);
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
}): NodeRequestOverview {
  const payload = options.payload ?? null;
  const request = getRequestObject(payload);
  const requestContextMeta = options.requestContextMeta ?? null;

  const omittedByMarker =
    Boolean(request?.["_pluvianai_message_bodies_omitted"]) ||
    Boolean(payload?.["_pluvianai_message_bodies_omitted"]);
  const truncatedByMarker =
    Boolean(request?.["_pluvianai_truncated"]) || Boolean(payload?.["_pluvianai_truncated"]);

  const model =
    typeof options.model === "string" && options.model.trim()
      ? options.model.trim()
      : typeof request?.model === "string" && request.model.trim()
        ? request.model.trim()
        : "Not detected";

  const provider =
    typeof options.provider === "string" && options.provider.trim()
      ? options.provider.trim()
      : "Not detected";

  return {
    provider,
    model,
    messageCount: countMessages(request),
    toolsCount: countTools(request),
    temperature: maybeNumber(request?.temperature),
    topP: maybeNumber(request?.top_p),
    maxTokens: maybeNumber(request?.max_tokens),
    extendedContextKeys: collectExtendedContextKeys(payload, request),
    additionalRequestKeys: collectAdditionalRequestKeys(request),
    omittedByPolicy: requestContextMeta?.omitted_by_policy === true || omittedByMarker,
    truncated: requestContextMeta?.truncated === true || truncatedByMarker,
  };
}
