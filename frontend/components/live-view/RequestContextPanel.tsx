"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { AlignLeft, BookOpen, FileText, Layers, SlidersHorizontal } from "lucide-react";

import type { RequestContextMeta } from "@/lib/api/live-view";
import {
  collectAdditionalRequestEntries,
  collectRequestControlEntries,
  getRequestObject,
} from "@/lib/requestOverview";

export type RequestContextSnapshot = {
  system_prompt?: string | null;
  user_message?: string | null;
  request_prompt?: string | null;
  payload?: Record<string, unknown> | null;
  request_context_meta?: RequestContextMeta | null;
};

const RAG_KEYS = ["context", "retrieved_chunks", "documents", "attachments", "rag_context", "sources"] as const;
const MAX_PREVIEW_CHARS = 8000;

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CollapsiblePre({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > MAX_PREVIEW_CHARS;
  const shown = expanded || !long ? text : `${text.slice(0, MAX_PREVIEW_CHARS)}\n\n… (${text.length} chars total)`;

  return (
    <div className="space-y-2">
      <pre
        className={clsx(
          "overflow-x-auto whitespace-pre-wrap break-all text-sm font-mono leading-relaxed selection:bg-emerald-500/30",
          className
        )}
      >
        {shown}
      </pre>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="text-xs font-medium text-sky-400/90 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70"
        >
          {expanded ? "Show less" : "Show full text"}
        </button>
      ) : null}
    </div>
  );
}

function roleLabel(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized === "system") return "System";
  if (normalized === "user") return "User";
  if (normalized === "assistant") return "Assistant";
  if (normalized === "tool") return "Tool";
  return role;
}

function messageContentPreview(message: Record<string, unknown>): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (content != null && typeof content === "object") return safeStringify(content);
  return "";
}

export function RequestContextPanel({ snapshot }: { snapshot: RequestContextSnapshot }) {
  const meta = snapshot.request_context_meta;
  const payload = useMemo(() => ((snapshot.payload || {}) as Record<string, unknown>), [snapshot.payload]);
  const requestObject = useMemo(() => getRequestObject(payload) ?? undefined, [payload]);

  const messages = useMemo(() => {
    const raw = requestObject?.messages;
    if (Array.isArray(raw)) {
      return raw.filter(item => item && typeof item === "object") as Record<string, unknown>[];
    }
    return null;
  }, [requestObject?.messages]);

  const extendedBlocks = useMemo(() => {
    const blocks: Array<{ key: string; label: string; value: unknown }> = [];
    const scan = (object: Record<string, unknown> | undefined, prefix: string) => {
      if (!object) return;
      for (const key of RAG_KEYS) {
        if (key in object && object[key] != null && object[key] !== "") {
          blocks.push({ key: `${prefix}${key}`, label: key, value: object[key] });
        }
      }
    };

    scan(payload, "payload.");
    scan(getRequestObject(payload) ?? undefined, "request.");
    return blocks;
  }, [payload]);

  const requestControls = useMemo(() => collectRequestControlEntries(requestObject ?? null), [requestObject]);
  const additionalRequestFields = useMemo(
    () => collectAdditionalRequestEntries(requestObject ?? null),
    [requestObject]
  );

  const omittedFromPayload =
    Boolean(requestObject?.["_pluvianai_message_bodies_omitted"]) ||
    Boolean(payload?.["_pluvianai_message_bodies_omitted"]);
  const truncatedFromPayload =
    Boolean(requestObject?.["_pluvianai_truncated"]) || Boolean(payload?.["_pluvianai_truncated"]);
  const omittedRequest = meta?.omitted_by_policy === true || (meta == null && omittedFromPayload);
  const truncatedRequest = meta?.truncated === true || (meta == null && truncatedFromPayload);
  const requestTextOmitted =
    meta?.request_text_omitted === true ||
    (meta?.request_text_omitted == null && Boolean(requestObject?.["_pluvianai_message_bodies_omitted"]));
  const responseTextOmitted =
    meta?.response_text_omitted === true ||
    (meta?.response_text_omitted == null &&
      Boolean((payload.response as Record<string, unknown> | undefined)?.["_pluvianai_response_bodies_omitted"]));
  const requestTruncated =
    meta?.request_truncated === true ||
    (meta?.request_truncated == null && Boolean(requestObject?.["_pluvianai_truncated"]));
  const payloadTruncated =
    meta?.payload_truncated === true ||
    (meta?.payload_truncated == null && Boolean(payload?.["_pluvianai_truncated"]));

  const captureWarnings = [
    truncatedRequest
      ? requestTruncated && payloadTruncated
        ? "This snapshot was truncated both at the request level and at the outer payload level before ingest."
        : requestTruncated
          ? "This snapshot does not contain the full original request. Request fields were shortened or replaced before ingest."
          : payloadTruncated
            ? "This snapshot payload was truncated before ingest. Some nested request fields may be incomplete."
            : "This snapshot does not contain the full original request. Large fields may have been shortened or replaced before ingest."
      : null,
    omittedRequest
      ? requestTextOmitted && responseTextOmitted
        ? "Privacy settings omitted both request text and response text before ingest."
        : requestTextOmitted
          ? "Privacy settings omitted some request text before ingest. Use this view as a request-shape reference, not a byte-exact replay record."
          : responseTextOmitted
            ? "Privacy settings omitted some response text before ingest. Request-shape fields may still be accurate."
            : "Privacy settings omitted some request or response text before ingest."
      : null,
    (truncatedRequest || omittedRequest) && (requestControls.length > 0 || additionalRequestFields.length > 0)
      ? "Controls and additional fields below reflect only the portion that was retained."
      : null,
  ].filter(Boolean) as string[];

  const renderFieldSection = (
    title: string,
    icon: React.ComponentType<{ className?: string }>,
    accentClassName: string,
    description: string | null,
    fields: Array<{ key: string; value: unknown }>
  ) => {
    if (fields.length === 0) return null;
    const Icon = icon;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <Icon className={clsx("h-5 w-5", accentClassName)} />
          <span className="text-sm font-semibold text-slate-200">{title}</span>
        </div>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        <div className="space-y-4">
          {fields.map(field => (
            <div key={field.key} className="rounded-xl border border-white/5 bg-[#0a0a0c] p-4">
              <div className="mb-2 text-xs font-medium text-cyan-300/90">{field.key}</div>
              <CollapsiblePre text={safeStringify(field.value) || "—"} className="text-slate-300" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (messages && messages.length > 0) {
    return (
      <div className="space-y-8">
        {captureWarnings.length > 0 ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            <div className="space-y-1.5">
              {captureWarnings.map(message => (
                <div key={message}>{message}</div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <Layers className="h-5 w-5 text-sky-400" />
            <span className="text-sm font-semibold text-slate-200">Request messages</span>
          </div>
          <div className="space-y-4">
            {messages.map((message, idx) => {
              const role = String(message.role ?? "unknown");
              const preview = messageContentPreview(message);
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-white/5 bg-[#0a0a0c] p-4"
                  aria-label={`Message ${idx + 1} ${role}`}
                >
                  <div className="mb-2 text-xs font-medium text-sky-400/90">{roleLabel(role)}</div>
                  <CollapsiblePre text={preview || "—"} className="text-slate-300" />
                </div>
              );
            })}
          </div>
        </div>

        {extendedBlocks.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <BookOpen className="h-5 w-5 text-violet-400" />
              <span className="text-sm font-semibold text-slate-200">Extended context</span>
            </div>
            <p className="text-xs text-slate-500">
              RAG, attachments, and custom keys detected in the payload. Schema can vary by app.
            </p>
            {extendedBlocks.map(block => (
              <div key={block.key} className="rounded-xl border border-violet-500/10 bg-[#0a0a0c] p-4">
                <div className="mb-2 text-xs font-medium text-violet-300/90">{block.label}</div>
                <CollapsiblePre text={safeStringify(block.value)} className="text-slate-400" />
              </div>
            ))}
          </div>
        ) : null}

        {renderFieldSection(
          "Request controls",
          SlidersHorizontal,
          "text-fuchsia-400",
          "Provider-level controls captured on this request, including sampling and output/tool options.",
          requestControls
        )}

        {renderFieldSection(
          "Additional request fields",
          FileText,
          "text-cyan-400",
          "Top-level request fields that can materially change replay behavior and are not part of the message list.",
          additionalRequestFields
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {captureWarnings.length > 0 ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
          <div className="space-y-1.5">
            {captureWarnings.map(message => (
              <div key={message}>{message}</div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <AlignLeft className="h-5 w-5 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">System prompt</span>
        </div>
        <div className="overflow-x-auto rounded-[20px] border border-white/5 bg-[#030806] p-6 font-mono text-sm leading-relaxed text-slate-400 shadow-inner selection:bg-emerald-500/30">
          {safeStringify(snapshot.system_prompt) || "—"}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <AlignLeft className="h-5 w-5 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200">User input</span>
        </div>
        <div className="overflow-x-auto rounded-[20px] border border-white/5 bg-[#030806] p-6 font-mono text-sm leading-relaxed text-slate-300 shadow-inner selection:bg-emerald-500/30">
          {safeStringify(snapshot.request_prompt ?? snapshot.user_message) || "—"}
        </div>
      </div>

      {extendedBlocks.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <FileText className="h-5 w-5 text-violet-400" />
            <span className="text-sm font-semibold text-slate-200">Extended context</span>
          </div>
          {extendedBlocks.map(block => (
            <div key={block.key} className="rounded-xl border border-violet-500/10 bg-[#0a0a0c] p-4">
              <div className="mb-2 text-xs font-medium text-violet-300/90">{block.label}</div>
              <CollapsiblePre text={safeStringify(block.value)} className="text-slate-400" />
            </div>
          ))}
        </div>
      ) : null}

      {renderFieldSection(
        "Request controls",
        SlidersHorizontal,
        "text-fuchsia-400",
        "Provider-level controls captured on this request, including sampling and output/tool options.",
        requestControls
      )}

      {renderFieldSection(
        "Additional request fields",
        FileText,
        "text-cyan-400",
        "Top-level request fields that can materially change replay behavior and are not part of the main prompt text.",
        additionalRequestFields
      )}
    </div>
  );
}
