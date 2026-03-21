"use client";

import React, { useMemo, useState } from "react";
import clsx from "clsx";
import { AlignLeft, BookOpen, FileText, Layers } from "lucide-react";

import type { RequestContextMeta } from "@/lib/api/live-view";

/** Snapshot shape used by SnapshotDetailModal (subset). */
export type RequestContextSnapshot = {
  system_prompt?: string | null;
  user_message?: string | null;
  request_prompt?: string | null;
  payload?: Record<string, unknown> | null;
  /** From GET snapshot when backend derived hints from stored payload (preferred). */
  request_context_meta?: RequestContextMeta | null;
};

const RAG_KEYS = ["context", "retrieved_chunks", "documents", "attachments", "rag_context", "sources"] as const;

const MAX_PREVIEW_CHARS = 8000;

function safeStringify(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

function CollapsiblePre({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > MAX_PREVIEW_CHARS;
  const shown = expanded || !long ? text : `${text.slice(0, MAX_PREVIEW_CHARS)}\n\n… (${text.length} chars total)`;
  return (
    <div className="space-y-2">
      <pre
        className={clsx(
          "text-sm font-mono leading-relaxed whitespace-pre-wrap break-all selection:bg-emerald-500/30 overflow-x-auto",
          className
        )}
      >
        {shown}
      </pre>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="text-xs font-medium text-sky-400/90 hover:text-sky-300"
        >
          {expanded ? "Show less" : "Show full text"}
        </button>
      ) : null}
    </div>
  );
}

function roleLabel(role: string): string {
  const r = role.toLowerCase();
  if (r === "system") return "System";
  if (r === "user") return "User";
  if (r === "assistant") return "Assistant";
  if (r === "tool") return "Tool";
  return role;
}

function messageContentPreview(m: Record<string, unknown>): string {
  const c = m.content;
  if (typeof c === "string") return c;
  if (c != null && typeof c === "object") {
    return safeStringify(c);
  }
  return "";
}

/**
 * Unified request context: `payload.request.messages` (OpenAI-style) when present,
 * else legacy `system_prompt` / `user_message` columns; plus heuristic RAG/attachment blocks.
 * See docs/live-view-ingest-field-matrix.md
 */
export function RequestContextPanel({ snapshot }: { snapshot: RequestContextSnapshot }) {
  const meta = snapshot.request_context_meta;
  const payload = (snapshot.payload || {}) as Record<string, unknown>;
  const req = (payload.request ?? payload.request_data) as Record<string, unknown> | undefined;
  const messages = useMemo(() => {
    const raw = req?.messages;
    if (Array.isArray(raw)) return raw.filter(m => m && typeof m === "object") as Record<string, unknown>[];
    return null;
  }, [payload]);

  const extendedBlocks = useMemo(() => {
    const blocks: { key: string; label: string; value: unknown }[] = [];
    const scan = (obj: Record<string, unknown> | undefined, prefix: string) => {
      if (!obj) return;
      for (const k of RAG_KEYS) {
        if (k in obj && obj[k] != null && obj[k] !== "") {
          blocks.push({
            key: `${prefix}${k}`,
            label: k,
            value: obj[k],
          });
        }
      }
    };
    const innerReq = (payload.request ?? payload.request_data) as Record<string, unknown> | undefined;
    scan(payload, "payload.");
    scan(innerReq, "request.");
    return blocks;
  }, [payload]);

  const omittedFromPayload =
    Boolean(req?.["_pluvianai_message_bodies_omitted"]) || Boolean(payload?.["_pluvianai_message_bodies_omitted"]);
  const truncatedFromPayload =
    Boolean(req?.["_pluvianai_truncated"]) || Boolean(payload?.["_pluvianai_truncated"]);
  const omittedRequest =
    meta?.omitted_by_policy === true || (meta == null && omittedFromPayload);
  const truncatedRequest = meta?.truncated === true || (meta == null && truncatedFromPayload);

  if (messages && messages.length > 0) {
    return (
      <div className="space-y-8">
        {omittedRequest || truncatedRequest ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
            {truncatedRequest
              ? "Request payload was truncated or replaced before ingest (size limit)."
              : "Message bodies were omitted before ingest (SDK privacy). Metadata such as role and length may still appear."}
          </div>
        ) : null}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <Layers className="h-5 w-5 text-sky-400" />
            <span className="text-sm font-bold uppercase tracking-widest text-slate-200">Request messages</span>
          </div>
          <div className="space-y-4">
            {messages.map((m, idx) => {
              const role = String(m.role ?? "unknown");
              const prev = messageContentPreview(m);
              return (
                <div
                  key={idx}
                  className="rounded-xl border border-white/5 bg-[#0a0a0c] p-4"
                  aria-label={`Message ${idx + 1} ${role}`}
                >
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-sky-400/90">
                    {roleLabel(role)}
                  </div>
                  <CollapsiblePre text={prev || "—"} className="text-slate-300" />
                </div>
              );
            })}
          </div>
        </div>

        {extendedBlocks.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 border-b border-white/5 pb-3">
              <BookOpen className="h-5 w-5 text-violet-400" />
              <span className="text-sm font-bold uppercase tracking-widest text-slate-200">Extended context</span>
            </div>
            <p className="text-xs text-slate-500">
              RAG / attachments / custom keys detected in payload (heuristic). Schema may vary by app.
            </p>
            {extendedBlocks.map(b => (
              <div key={b.key} className="rounded-xl border border-violet-500/10 bg-[#0a0a0c] p-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-300/90">{b.label}</div>
                <CollapsiblePre text={safeStringify(b.value)} className="text-slate-400" />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  /* Legacy: columnar system + user only */
  return (
    <div className="space-y-8">
      {omittedRequest || truncatedRequest ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
          {truncatedRequest
            ? "Request payload was truncated before ingest (size limit)."
            : "User/system text may have been omitted before ingest (SDK privacy)."}
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <AlignLeft className="h-5 w-5 text-slate-400" />
          <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">System Prompt</span>
        </div>
        <div className="bg-[#030806] border border-white/5 rounded-[20px] p-6 text-sm text-slate-400 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
          {safeStringify(snapshot.system_prompt) || "—"}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-3">
          <AlignLeft className="h-5 w-5 text-slate-400" />
          <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">User Input</span>
        </div>
        <div className="bg-[#030806] border border-white/5 rounded-[20px] p-6 text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
          {safeStringify(snapshot.request_prompt ?? snapshot.user_message) || "—"}
        </div>
      </div>

      {extendedBlocks.length > 0 ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-3">
            <FileText className="h-5 w-5 text-violet-400" />
            <span className="text-sm font-bold uppercase tracking-widest text-slate-200">Extended context</span>
          </div>
          {extendedBlocks.map(b => (
            <div key={b.key} className="rounded-xl border border-violet-500/10 bg-[#0a0a0c] p-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-violet-300/90">{b.label}</div>
              <CollapsiblePre text={safeStringify(b.value)} className="text-slate-400" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
