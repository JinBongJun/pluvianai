"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlignLeft,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Code2,
  Coins,
  FileCheck,
  FileText,
  Lock,
  Repeat,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Terminal,
  Wrench,
  XCircle,
  Zap,
} from "lucide-react";
import clsx from "clsx";

import type {
  LiveViewRequestOverview,
  LiveViewToolTimelineRow,
  RequestContextMeta,
} from "@/lib/api/live-view";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import { RequestContextPanel } from "@/components/live-view/RequestContextPanel";
import { buildNodeRequestOverview } from "@/lib/requestOverview";
import { formatSnapshotCost, formatSnapshotTokens } from "@/lib/snapshotMetrics";

export interface SnapshotForDetail {
  id: string | number;
  trace_id?: string;
  agent_id?: string;
  provider?: string;
  model?: string;
  created_at?: string;
  latency_ms?: number | null;
  tokens_used?: number | null;
  cost?: number | string | null;
  system_prompt?: string | null;
  user_message?: string | null;
  request_prompt?: string | null;
  response?: string | null;
  response_text?: string | null;
  payload?: Record<string, unknown> | null;
  status_code?: number | null;
  has_tool_calls?: boolean;
  tool_calls_summary?: Array<{ name: string; arguments?: string | Record<string, unknown> }>;
  /** Tool IO timeline (ingest `tool_events` and/or persisted trajectory steps). */
  tool_timeline?: LiveViewToolTimelineRow[];
  /** Server-side redaction pass for tool_timeline (see API). */
  tool_timeline_redaction_version?: number;
  /** Derived from payload SDK markers on GET snapshot (preferred over client-only heuristics). */
  request_context_meta?: RequestContextMeta | null;
  /** Backend-derived replay-relevant request summary when available. */
  request_overview?: LiveViewRequestOverview | null;
}

export type PolicyState = {
  status: "idle" | "loading" | "pass" | "fail" | "error";
  message?: string;
};

export interface EvalRow {
  id: string;
  status: string;
}

export interface EvalResultOverride {
  policyStatus?: string;
  evalRows?: EvalRow[];
}

const EVAL_CHECK_LABELS: Record<string, string> = {
  empty: "Empty / Short Answers",
  latency: "Latency Spikes",
  status_code: "HTTP Error Codes",
  refusal: "Refusal / Non-Answer",
  json: "JSON Validity",
  length: "Output Length Drift",
  repetition: "Repetition / Loops",
  required: "Required Keywords / Fields",
  format: "Format Contract",
  leakage: "PII Leakage Shield",
  tool: "Tool Use Policy",
};

/** Match icons to AgentEvaluationPanel (Evaluation tab) so detail view is consistent. */
const EVAL_CHECK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  empty: AlertTriangle,
  latency: Clock,
  status_code: XCircle,
  refusal: ShieldAlert,
  json: Code2,
  length: SlidersHorizontal,
  repetition: Repeat,
  required: FileCheck,
  format: FileText,
  leakage: Lock,
  tool: ShieldCheck,
};

/**
 * Derive the list of eval check IDs that are "enabled" based on saved eval config.
 * This uses the same normalization semantics as Live View (e.g. tool_use_policy -> tool).
 */
function getEnabledCheckIdsFromConfig(savedEvalConfig: Record<string, unknown>): string[] {
  const enabled: string[] = [];
  const entries = Object.entries(savedEvalConfig || {});
  if (entries.length === 0) return [];

  for (const [rawKey, value] of entries) {
    const key = rawKey === "tool_use_policy" ? "tool" : rawKey;
    if (!(key in EVAL_CHECK_LABELS)) continue;

    const v = value as { enabled?: unknown } | boolean;
    let isEnabled = true;
    if (typeof v === "boolean") {
      isEnabled = v;
    } else if (typeof v === "object" && v !== null && "enabled" in v) {
      const flag = (v as { enabled?: unknown }).enabled;
      if (typeof flag === "boolean") isEnabled = flag;
    }

    if (isEnabled) enabled.push(key);
  }

  if (!enabled.length) return [];

  // Preserve user-facing order defined by EVAL_CHECK_LABELS.
  const order = Object.keys(EVAL_CHECK_LABELS);
  return Array.from(new Set(enabled)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function formatPrettyTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("en-US")} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`;
}

function safeStringify(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatEvalStatus(status: string): string {
  if (status === "na") return "NA";
  if (status === "not_applicable") return "N/A";
  if (status === "not_implemented") return "NOT IMPLEMENTED";
  return status;
}

function extractStepLogs(
  snapshot: SnapshotForDetail
): Array<{ name: string; status: string; runtimeMs?: number; detail?: string }> {
  const payload = (snapshot.payload || {}) as Record<string, unknown>;
  const candidates = [
    payload.steps,
    payload.step_log,
    (payload.trajectory as any)?.steps,
    payload.events,
  ];
  const raw = candidates.find(c => Array.isArray(c));
  if (!Array.isArray(raw)) return [];
  const MAX = 30;
  return raw.slice(0, MAX).map((step: any, idx: number) => {
    if (typeof step === "string") {
      return { name: `step_${idx + 1}`, status: "unknown", detail: step };
    }
    const name = String(
      step?.name ?? step?.id ?? step?.tool ?? step?.type ?? step?.action ?? `step_${idx + 1}`
    );
    const status = String(
      step?.status ??
        step?.state ??
        step?.result ??
        (step?.ok === false ? "fail" : step?.ok === true ? "pass" : "unknown")
    ).toLowerCase();
    const runtimeMs =
      typeof step?.runtime_ms === "number"
        ? step.runtime_ms
        : typeof step?.duration_ms === "number"
          ? step.duration_ms
          : typeof step?.latency_ms === "number"
            ? step.latency_ms
            : undefined;
    const detailValue = step?.detail ?? step?.message ?? step?.output ?? step?.summary;
    const detail =
      typeof detailValue === "string"
        ? detailValue
        : detailValue != null
          ? JSON.stringify(detailValue)
          : undefined;
    return { name, status, runtimeMs, detail };
  });
}

function getEvalDetail(
  s: SnapshotForDetail,
  checkId: string,
  savedEvalConfig: Record<string, unknown>
): { actualStr: string; configStr: string } {
  const cfg = (savedEvalConfig[checkId] || {}) as Record<string, unknown>;
  const res = String((s.response_text ?? s.response ?? "") || "").trim();
  const len = res.length;
  let actualStr = "—";
  let configStr = "—";
  switch (checkId) {
    case "empty": {
      const minChars = toFiniteNumber(cfg?.min_chars, 16);
      configStr = `min ${minChars} chars`;
      actualStr = `${len} chars`;
      return { actualStr, configStr };
    }
    case "latency": {
      const warn = toFiniteNumber(cfg?.warn_ms, 2000);
      const crit = toFiniteNumber(cfg?.crit_ms, 5000);
      configStr = `warn > ${warn}ms, crit > ${crit}ms`;
      const ms = s.latency_ms ?? 0;
      actualStr = `${ms}ms`;
      return { actualStr, configStr };
    }
    case "status_code": {
      const warnFrom = toFiniteNumber(cfg?.warn_from, 400);
      const critFrom = toFiniteNumber(cfg?.crit_from, 500);
      configStr = `warn ≥ ${warnFrom}, crit ≥ ${critFrom}`;
      const code = s.status_code ?? 200;
      actualStr = String(code);
      return { actualStr, configStr };
    }
    case "length": {
      const warnR = toFiniteNumber(cfg?.warn_ratio, 0.35);
      const critR = toFiniteNumber(cfg?.crit_ratio, 0.75);
      configStr = `warn ±${Math.round(warnR * 100)}%, crit ±${Math.round(critR * 100)}% vs baseline`;
      actualStr = `${len} chars (vs baseline window)`;
      return { actualStr, configStr };
    }
    case "repetition": {
      const warnR = toFiniteNumber(cfg?.warn_line_repeats, 3);
      const critR = toFiniteNumber(cfg?.crit_line_repeats, 6);
      configStr = `warn ${warnR}, crit ${critR} repeats`;
      const lines = res
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length >= 4);
      const counts: Record<string, number> = {};
      let maxRep = 0;
      for (const line of lines) {
        counts[line] = (counts[line] || 0) + 1;
        if (counts[line] > maxRep) maxRep = counts[line];
      }
      actualStr = maxRep ? `${maxRep} max repeats` : "—";
      return { actualStr, configStr };
    }
    case "json": {
      const mode = String(cfg?.mode || "if_json");
      configStr = mode === "if_json" ? "if_json" : mode === "always" ? "always" : "if_json";
      return { actualStr, configStr };
    }
    case "refusal": {
      configStr = "auto-detect refusal / non-answer patterns";
      return { actualStr, configStr };
    }
    case "required": {
      const keywordsCsv = String(cfg?.keywords_csv || "");
      const jsonFieldsCsv = String(cfg?.json_fields_csv || "");
      const keywordCount = keywordsCsv.split(",").filter(part => part.trim().length > 0).length;
      const fieldCount = jsonFieldsCsv.split(",").filter(part => part.trim().length > 0).length;
      configStr = `keywords: ${keywordCount}, json fields: ${fieldCount}`;
      return { actualStr, configStr };
    }
    case "format": {
      const sectionsCsv = String(cfg?.sections_csv || "");
      const sectionCount = sectionsCsv.split(",").filter(part => part.trim().length > 0).length;
      configStr = `required sections: ${sectionCount}`;
      return { actualStr, configStr };
    }
    case "leakage": {
      configStr = "scan for PII (email, phone) & API keys";
      return { actualStr, configStr };
    }
    default:
      return { actualStr, configStr };
  }
}

function buildToolSummaryEmptyLines(s: SnapshotForDetail): string[] {
  const hasSummary = Array.isArray(s.tool_calls_summary) && s.tool_calls_summary.length > 0;
  if (hasSummary) return [];
  if (s.has_tool_calls) {
    return [
      "This snapshot is flagged as having tool calls, but no argument summary was stored.",
      "Open a fresh capture after ingest, or confirm the proxy/SDK stores tool_calls_summary when available.",
    ];
  }
  return [
    "No provider tool_calls summary on this snapshot.",
    "Summaries appear when the captured LLM response includes tool_calls or when ingest stores tool_calls_summary.",
  ];
}

function buildToolTimelineEmptyLines(s: SnapshotForDetail): string[] {
  const payload = (s.payload || {}) as Record<string, unknown>;
  const rawEvents = payload.tool_events;
  const hasKey = Object.prototype.hasOwnProperty.call(payload, "tool_events");
  const events = Array.isArray(rawEvents) ? rawEvents : [];

  if (hasKey && events.length === 0) {
    return [
      "tool_events was sent on ingest but is empty for this request.",
      "Record tool_call / tool_result (and optional action) rows from your agent so the timeline can render.",
    ];
  }
  if (hasKey && events.length > 0) {
    return [
      "tool_events exists in the payload but no timeline rows were produced.",
      "Check TOOL_EVENTS_SCHEMA shape, or refresh the snapshot detail after ingest normalization.",
    ];
  }
  return [
    "No tool_call / tool_result timeline for this snapshot.",
    "Send tool_events from the SDK on POST …/api-calls, or capture provider responses that include tool calls.",
    "Tool Use Policy (Evaluation) validates policy only; it is not a substitute for a captured tool trace.",
  ];
}

function buildActionsEmptyLines(s: SnapshotForDetail, actionRowCount: number): string[] {
  if (actionRowCount > 0) return [];
  const payload = (s.payload || {}) as Record<string, unknown>;
  const rawEvents = payload.tool_events;
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const hasAction = events.some((ev: unknown) => {
    const o = ev as Record<string, unknown> | null;
    return o && String(o.kind ?? o.type ?? "").toLowerCase() === "action";
  });
  if (hasAction) {
    return ["Action events are present but did not normalize into display rows.", "See docs/TOOL_EVENTS_SCHEMA.md for action shape."];
  }
  return [
    "No outbound actions (email, Slack, HTTP, etc.) recorded for this snapshot.",
    "When your agent emits action-style side effects, include them in tool_events with kind action.",
  ];
}

function extractCustomCode(snapshot: SnapshotForDetail): string | null {
  const payload = (snapshot.payload || {}) as Record<string, unknown>;
  const maybeCode =
    payload.custom_code ??
    payload.code ??
    payload.script ??
    (payload.agent_config as any)?.custom_code ??
    (payload.agent_config as any)?.script;
  if (typeof maybeCode === "string" && maybeCode.trim()) return maybeCode.trim();
  if (maybeCode != null && typeof maybeCode === "object") {
    try {
      return JSON.stringify(maybeCode, null, 2);
    } catch {
      return String(maybeCode);
    }
  }
  return null;
}

function EmptyHint({ lines }: { lines: string[] }) {
  return (
    <div
      className="rounded-2xl border border-dashed border-white/10 bg-[#030806] p-4 text-left space-y-2"
      role="status"
    >
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-slate-500 leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}

export interface SnapshotDetailModalProps {
  snapshot: SnapshotForDetail;
  onClose: () => void;
  policyState?: PolicyState | null;
  evalRows?: EvalRow[];
  savedEvalConfig?: Record<string, unknown>;
  evalEnabled?: boolean;
  /** When set (e.g. from Drift right panel), overrides Evaluation section */
  evalResultOverride?: EvalResultOverride | null;
  /** Optional note for eval section (e.g. "Eval result from snapshot capture time.") */
  evalContextLabel?: string | null;
  /** When "saved", Evaluation block uses past/archived styling (muted colors, dashed border, clock icon). */
  appearance?: "current" | "saved";
  /** Override z-index of the overlay (e.g. 10000) when modal must appear above portaled side panels. */
  overlayZIndex?: number;
  /**
   * When set, shows a short Release Gate CTA (pre-deploy replay). Omit in contexts already inside Release Gate if you prefer.
   */
  releaseGateHref?: string | null;
}

export function SnapshotDetailModal({
  snapshot: s,
  onClose,
  policyState = { status: "idle" },
  evalRows = [],
  savedEvalConfig = {},
  evalEnabled = false,
  evalResultOverride = null,
  evalContextLabel = null,
  appearance = "current",
  overlayZIndex,
  releaseGateHref = null,
}: SnapshotDetailModalProps) {
  const isSavedAppearance = appearance === "saved";
  const stepLogs = extractStepLogs(s);
  const customCode = extractCustomCode(s);
  const requestOverview = React.useMemo(
    () =>
      buildNodeRequestOverview({
        payload: (s.payload as Record<string, unknown> | null | undefined) ?? null,
        provider: s.provider,
        model: s.model,
        requestContextMeta: s.request_context_meta ?? null,
        serverRequestOverview: s.request_overview ?? null,
      }),
    [s]
  );

  const tl = s.tool_timeline ?? [];
  const actionRows = tl.filter(r => r.step_type === "action");
  const toolIoRows = tl.filter(r => r.step_type !== "action");
  const hasToolSummaryCards =
    Array.isArray(s.tool_calls_summary) && s.tool_calls_summary.length > 0;
  const summaryEmptyLines = buildToolSummaryEmptyLines(s);
  const timelineEmptyLines = buildToolTimelineEmptyLines(s);
  const actionsEmptyLines = buildActionsEmptyLines(s, actionRows.length);

  const useOverride = !!evalResultOverride;

  // Base eval rows coming from caller (Live View runtime or Release Gate run).
  const baseEvalRows: EvalRow[] = useOverride ? (evalResultOverride?.evalRows ?? []) : evalRows;

  // For re-evaluation result views (override mode), show all currently enabled checks.
  // For historical snapshot views, keep rows exactly as stored to avoid introducing
  // synthetic N/A cards for checks that did not exist at capture time.
  const shouldExpandFromSavedConfig = useOverride;
  const enabledCheckIds = getEnabledCheckIdsFromConfig(savedEvalConfig);
  const displayEvalRows: EvalRow[] =
    !shouldExpandFromSavedConfig || enabledCheckIds.length === 0
      ? baseEvalRows
      : (() => {
          const statusById = new Map<string, string>();
          for (const row of baseEvalRows) {
            if (!row?.id) continue;
            statusById.set(row.id, row.status);
          }
          return enabledCheckIds.map(id => ({
            id,
            status: statusById.get(id) ?? "not_applicable",
          }));
        })();

  const effectiveEvalEnabled = displayEvalRows.length > 0 || (!useOverride && evalEnabled);

  const failedCount = displayEvalRows.filter(r => r.status === "fail").length;
  const passedCount = displayEvalRows.filter(r => r.status === "pass").length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-start justify-center p-4 pt-[90px] md:p-8 md:pt-[90px]"
      style={{ zIndex: overlayZIndex ?? 1100 }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ scale: 0.96, y: 15 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 15 }}
        className="relative w-full max-w-5xl max-h-[calc(100vh-120px)] md:max-h-[calc(100vh-140px)] bg-[#111216] border border-white/10 rounded-[32px] shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between px-8 py-5 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-widest">
                Snapshot Details
              </h3>
              <p className="text-xs text-slate-400 font-medium tracking-wide mt-0.5">
                {formatPrettyTime(s.created_at as string)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors group"
          >
            <XCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
          </button>
        </div>

        <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar">
          <div className="bg-[#030806] p-6 rounded-[24px] mb-10 shadow-inner shrink-0">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Activity className="w-6 h-6 text-blue-500 mb-1" />
                <span className="text-sm font-medium text-slate-400">Status</span>
                <span
                  className={clsx(
                    "text-lg font-black uppercase tracking-wider",
                    failedCount === 0
                      ? "text-emerald-400"
                      : passedCount > 0 && failedCount > 0
                        ? "text-amber-500"
                        : "text-rose-400"
                  )}
                >
                  {failedCount === 0
                    ? "PASS"
                    : passedCount > 0 && failedCount > 0
                      ? "PARTIAL"
                      : "FAIL"}
                </span>
              </div>
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Zap className="w-6 h-6 text-amber-500 mb-1" />
                <span className="text-sm font-medium text-slate-400">Latency</span>
                <span className="text-lg font-black text-slate-200">
                  {s.latency_ms != null ? `${s.latency_ms}ms` : "—"}
                </span>
              </div>
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <Coins className="w-6 h-6 text-violet-400 mb-1" />
                <span className="text-sm font-medium text-slate-400">Tokens</span>
                <span
                  className="text-lg font-black text-slate-200 tabular-nums"
                  title={s.tokens_used != null ? String(s.tokens_used) : undefined}
                >
                  {formatSnapshotTokens(s.tokens_used)}
                </span>
              </div>
              <div className="bg-[#18191e] border border-white/5 rounded-[20px] p-5 flex flex-col items-center justify-center gap-2 hover:border-white/10 transition-colors">
                <CircleDollarSign className="w-6 h-6 text-emerald-400/90 mb-1" />
                <span className="text-sm font-medium text-slate-400">Cost</span>
                <span
                  className="text-lg font-black text-slate-200 tabular-nums"
                  title={s.cost != null && s.cost !== "" ? String(s.cost) : undefined}
                >
                  {formatSnapshotCost(s.cost)}
                </span>
              </div>
            </div>
          </div>

          {releaseGateHref ? (
            <div className="mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-950/25 px-4 py-3 text-sm text-slate-300">
              <span className="font-semibold text-slate-200">Pre-deploy verification: </span>
              Use{" "}
              <Link
                href={releaseGateHref}
                className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
              >
                Release Gate
              </Link>{" "}
              to replay production snapshots with a candidate model or tool configuration before you ship.
            </div>
          ) : null}

          <div className="flex flex-col gap-12 shrink-0">
            <div className="space-y-8">
              <div className="rounded-[24px] border border-white/5 bg-[#0f1115] p-6 shadow-inner">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <SlidersHorizontal className="h-5 w-5 text-fuchsia-400" />
                  <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                    Node Request Overview
                  </span>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  Replay-relevant request shape captured for this node call.
                </p>

                {requestOverview.truncated || requestOverview.omittedByPolicy ? (
                  <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
                    {requestOverview.truncated ? (
                      <div>
                        This snapshot does not include the full original request. Large fields may have been shortened
                        or replaced before ingest.
                      </div>
                    ) : null}
                    {requestOverview.omittedByPolicy ? (
                      <div className={clsx(requestOverview.truncated ? "mt-1.5" : null)}>
                        Privacy settings omitted some request text before ingest. Treat the sections below as the best
                        retained baseline, not a byte-exact replay record.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Model
                    </div>
                    <div className="mt-1 text-sm font-mono text-slate-200 break-all">
                      {requestOverview.model}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Provider
                    </div>
                    <div className="mt-1 text-sm text-slate-200">{requestOverview.provider}</div>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Request state
                    </div>
                    <div className="mt-1 text-sm text-slate-200">
                      {requestOverview.truncated
                        ? "Truncated"
                        : requestOverview.omittedByPolicy
                          ? "Policy-limited"
                          : "Complete"}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Messages
                    </div>
                    <div className="mt-1 text-sm text-slate-200">{requestOverview.messageCount}</div>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Tools
                    </div>
                    <div className="mt-1 text-sm text-slate-200">{requestOverview.toolsCount}</div>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Sampling
                    </div>
                    <div className="mt-1 text-sm text-slate-200">
                      {[
                        requestOverview.temperature != null
                          ? `temp ${requestOverview.temperature}`
                          : null,
                        requestOverview.topP != null ? `top_p ${requestOverview.topP}` : null,
                        requestOverview.maxTokens != null
                          ? `max ${requestOverview.maxTokens}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Default / not captured"}
                    </div>
                  </div>
                </div>

                {requestOverview.extendedContextKeys.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Extended context keys
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {requestOverview.extendedContextKeys.map(key => (
                        <span
                          key={key}
                          className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-200"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {requestOverview.additionalRequestKeys.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Additional request keys
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {requestOverview.additionalRequestKeys.map(key => (
                        <span
                          key={key}
                          className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-100"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {requestOverview.requestControlKeys.length > 0 ? (
                  <div className="mt-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Request controls
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {requestOverview.requestControlKeys.map(key => (
                        <span
                          key={key}
                          className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-100"
                        >
                          {key}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <RequestContextPanel snapshot={s} />

              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <Wrench className="w-5 h-5 text-amber-500" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">
                    Tool activity
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tool calls (provider summary)
                  </div>
                  {hasToolSummaryCards ? (
                    <div className="bg-[#030806] border border-white/5 rounded-[20px] p-6 shadow-inner space-y-4">
                      {(s.tool_calls_summary || []).map((tc, idx) => (
                        <div key={idx} className="border border-white/5 rounded-xl p-4 bg-[#0a0a0c]">
                          <div className="text-xs font-bold text-amber-400/90 uppercase tracking-wider mb-2">
                            {tc.name}
                          </div>
                          <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all">
                            {typeof tc.arguments === "string"
                              ? tc.arguments
                              : safeStringify(tc.arguments)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyHint lines={summaryEmptyLines} />
                  )}
                </div>

                <div className="space-y-3">
                  {toolIoRows.length > 0 ? (
                    <ToolTimelinePanel
                      rows={toolIoRows}
                      title="Tool timeline (calls & I/O)"
                      icon={Terminal}
                      variant="snapshot"
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                        <Terminal className="h-5 w-5 text-sky-400" aria-hidden />
                        <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                          Tool timeline (calls &amp; I/O)
                        </span>
                      </div>
                      <EmptyHint lines={timelineEmptyLines} />
                    </>
                  )}
                </div>

                <div className="space-y-3">
                  {actionRows.length > 0 ? (
                    <ToolTimelinePanel
                      rows={actionRows}
                      title="Actions (side effects)"
                      subtitle="Outbound: email, Slack, HTTP, etc. — not LLM tool reads"
                      icon={Send}
                      variant="snapshot"
                    />
                  ) : (
                    <>
                      <div className="flex flex-col gap-1 border-b border-white/5 pb-3">
                        <div className="flex items-center gap-3">
                          <Send className="h-5 w-5 text-sky-400" aria-hidden />
                          <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                            Actions (side effects)
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 pl-8">
                          Outbound: email, Slack, HTTP, etc. — not LLM tool reads
                        </p>
                      </div>
                      <EmptyHint lines={actionsEmptyLines} />
                    </>
                  )}
                </div>
              </div>

              {customCode && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <Terminal className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">
                      Custom Code
                    </span>
                  </div>
                  <div className="bg-[#030806] border border-emerald-500/10 rounded-[20px] p-6 text-sm text-slate-300 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                    {customCode}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <AlignLeft className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">
                    Agent Response
                  </span>
                </div>
                <div className="bg-[#022c22]/20 border border-emerald-500/20 rounded-[20px] p-6 text-sm text-emerald-200 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                  {safeStringify(s.response_text ?? s.response)}
                </div>
              </div>
            </div>

            <div className="space-y-10">
              <div
                className={clsx(
                  "flex flex-col gap-4 rounded-2xl transition-colors",
                  isSavedAppearance &&
                    "border border-dashed border-amber-500/10 border-slate-600/30 bg-slate-800/40 bg-amber-950/20 p-4"
                )}
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    {isSavedAppearance ? (
                      <Clock className="w-5 h-5 text-amber-200/90" aria-hidden />
                    ) : (
                      <Scale className="w-5 h-5 text-slate-400" />
                    )}
                    <span
                      className={clsx(
                        "text-sm font-bold uppercase tracking-widest",
                        isSavedAppearance ? "text-slate-400" : "text-slate-200"
                      )}
                    >
                      Evaluation
                    </span>
                  </div>
                </div>
                {isSavedAppearance && (
                  <p className="text-[11px] text-amber-200/90 -mt-1 mb-1" role="status">
                    Snapshot at capture · Eval result from that time
                  </p>
                )}
                {evalContextLabel && (
                  <p
                    className={clsx(
                      "text-xs italic -mt-1 mb-2",
                      isSavedAppearance ? "text-slate-400" : "text-slate-500"
                    )}
                  >
                    {evalContextLabel}
                  </p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {effectiveEvalEnabled &&
                    displayEvalRows.map(row => {
                      const detail = getEvalDetail(s, row.id, savedEvalConfig);
                      const EvalIcon = EVAL_CHECK_ICONS[row.id] ?? Scale;
                      return (
                        <div
                          key={row.id}
                          className={clsx(
                            "p-5 rounded-[20px] flex flex-col items-center text-center gap-3 transition-colors",
                            isSavedAppearance
                              ? "bg-slate-800/40 border border-dashed border-slate-600/30"
                              : "bg-[#18191e] border border-white/5 hover:border-white/10"
                          )}
                        >
                          <div
                            className={clsx(
                              "p-3 rounded-2xl",
                              isSavedAppearance
                                ? "bg-slate-600/30 border border-slate-500/20"
                                : "bg-blue-500/10 border border-blue-500/20"
                            )}
                          >
                            <EvalIcon
                              className={clsx(
                                "w-6 h-6",
                                isSavedAppearance ? "text-slate-400" : "text-blue-400"
                              )}
                            />
                          </div>
                          <span
                            className={clsx(
                              "text-sm font-medium mt-1 line-clamp-1",
                              isSavedAppearance ? "text-slate-400" : "text-slate-200"
                            )}
                            title={EVAL_CHECK_LABELS[row.id]}
                          >
                            {EVAL_CHECK_LABELS[row.id] || row.id}
                          </span>
                          <div className="flex-1" />
                          {(detail.actualStr !== "—" || detail.configStr !== "—") && (
                            <div className="flex flex-col items-center gap-1 text-xs font-mono mb-2">
                              <span
                                className={clsx(
                                  row.status === "fail" && "font-bold",
                                  row.status === "fail"
                                    ? isSavedAppearance
                                      ? "text-rose-300"
                                      : "text-rose-400"
                                    : isSavedAppearance
                                      ? "text-slate-400"
                                      : "text-slate-300"
                                )}
                              >
                                {detail.actualStr}
                              </span>
                              <span
                                className={clsx(
                                  "text-[10px]",
                                  isSavedAppearance ? "text-slate-500" : "text-slate-500"
                                )}
                              >
                                ({detail.configStr})
                              </span>
                            </div>
                          )}
                          <span
                            className={clsx(
                              "px-3 py-1 text-xs font-black uppercase tracking-widest rounded-xl w-full",
                              row.status === "pass"
                                ? isSavedAppearance
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-emerald-500/10 text-emerald-400"
                                : row.status === "fail"
                                  ? isSavedAppearance
                                    ? "bg-rose-500/20 text-rose-300"
                                    : "bg-rose-500/10 text-rose-400"
                                  : "bg-slate-500/10 text-slate-500"
                            )}
                          >
                            {formatEvalStatus(row.status)}
                          </span>
                        </div>
                      );
                    })}
                </div>
                {effectiveEvalEnabled && displayEvalRows.length === 0 && (
                  <p
                    className={clsx(
                      "text-sm italic p-4 text-center rounded-2xl",
                      isSavedAppearance
                        ? "text-slate-400 border border-dashed border-slate-600/30"
                        : "text-slate-500 border border-dashed border-white/10"
                    )}
                  >
                    No eval result for this snapshot.
                  </p>
                )}
                {!evalContextLabel && displayEvalRows.length > 0 && !useOverride ? (
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed px-1">
                    Checks shown are those recorded for this snapshot at capture time (not necessarily every
                    check enabled in current settings).
                  </p>
                ) : null}
                {useOverride && displayEvalRows.length > 0 ? (
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed px-1">
                    Expanded rows use current eval settings; statuses come from the re-run or override
                    context.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-col gap-4 mt-10">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <Activity className="w-5 h-5 text-slate-400" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">
                    Execution Steps
                  </span>
                </div>
                <div className="flex flex-col gap-3 pb-4">
                  {!stepLogs.length && (
                    <div
                      className="space-y-2 p-4 text-left border border-dashed border-white/10 rounded-2xl"
                      role="status"
                    >
                      <p className="text-sm text-slate-400 font-medium">No execution steps recorded</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        We look for structured steps on the snapshot payload:{" "}
                        <code className="text-slate-400">steps</code>,{" "}
                        <code className="text-slate-400">step_log</code>,{" "}
                        <code className="text-slate-400">trajectory.steps</code>, or{" "}
                        <code className="text-slate-400">events</code>. If your integration does not send
                        these fields, this section stays empty even when the run succeeded.
                      </p>
                    </div>
                  )}
                  {stepLogs.map((step, idx) => (
                    <div
                      key={`${s.id}-step-${idx}`}
                      className="bg-[#18191e] border border-white/5 rounded-2xl p-4 flex flex-col gap-2 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {step.status.includes("fail") || step.status.includes("error") ? (
                            <XCircle className="w-5 h-5 text-rose-500" />
                          ) : step.status.includes("pass") || step.status.includes("success") ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-slate-500" />
                          )}
                          <span
                            className="text-sm text-slate-200 font-medium truncate max-w-[200px] md:max-w-md"
                            title={step.name}
                          >
                            {step.name}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono bg-white/5 px-2 py-1 rounded-xl">
                          {step.runtimeMs != null ? `${step.runtimeMs}ms` : "—"}
                        </span>
                      </div>
                      {step.detail && (
                        <div className="text-xs text-slate-400 mt-2 pl-8 font-mono bg-black/20 p-3 rounded-2xl border border-white/5">
                          {step.detail}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default SnapshotDetailModal;
