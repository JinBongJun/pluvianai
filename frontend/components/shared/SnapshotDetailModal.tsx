"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlignLeft,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Scale,
  Send,
  ShieldCheck,
  Terminal,
  Wrench,
  Zap,
  XCircle,
  SlidersHorizontal,
  Clock,
} from "lucide-react";
import clsx from "clsx";

import type {
  LiveViewRequestOverview,
  LiveViewToolTimelineRow,
  RequestContextMeta,
} from "@/lib/api/live-view";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import { RequestContextPanel } from "@/components/live-view/RequestContextPanel";
import { SnapshotRiskHero } from "@/components/shared/SnapshotRiskHero";
import { buildNodeRequestOverview } from "@/lib/requestOverview";
import {
  EVAL_CHECK_ICONS,
  formatEvalStatus,
  getEnabledCheckIdsFromConfig,
  getEvalCheckLabel,
  getEvalDetail,
} from "@/lib/evalPresentation";
import { buildSnapshotRiskSummary } from "@/lib/snapshotRiskSummary";

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

function buildToolSummaryEmptyLines(s: SnapshotForDetail): string[] {
  const hasSummary = Array.isArray(s.tool_calls_summary) && s.tool_calls_summary.length > 0;
  if (hasSummary) return [];
  if (s.has_tool_calls) {
    return [
      "Tool calls were detected, but no summary was captured for this run.",
      "Open technical details if you need the raw request fields.",
    ];
  }
  return [
    "No tool call summary was captured for this run.",
    "Open technical details if you need the raw ingest fields.",
  ];
}

function buildToolTimelineEmptyLines(s: SnapshotForDetail): string[] {
  const payload = (s.payload || {}) as Record<string, unknown>;
  const rawEvents = payload.tool_events;
  const hasKey = Object.prototype.hasOwnProperty.call(payload, "tool_events");
  const events = Array.isArray(rawEvents) ? rawEvents : [];

  if (hasKey && events.length === 0) {
    return [
      "Tool events were sent, but this run does not include a usable tool timeline.",
      "Open technical details if you need the raw ingest fields.",
    ];
  }
  if (hasKey && events.length > 0) {
    return [
      "Tool events were captured, but no normalized timeline is available for this run.",
      "Open technical details if you need the raw ingest fields.",
    ];
  }
  return [
    "No tool timeline was captured for this run.",
    "Open technical details if you need the raw ingest fields.",
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
    return [
      "Action events were detected, but no normalized action rows are available for this run.",
      "Open technical details if you need the raw ingest fields.",
    ];
  }
  return [
    "No outbound actions were recorded for this run.",
    "Open technical details if you need the raw ingest fields.",
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
      className="rounded-2xl border border-dashed border-white/10 bg-[#030806] p-4 text-left space-y-1.5"
      role="status"
    >
      {lines.map((line, i) => (
        <p key={i} className="text-xs text-slate-500 leading-6">
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
  const toolRiskIds = new Set(["tool", "tool_use_policy", "tool_grounding", "status_code"]);
  const hasToolRelatedEvalFailure = displayEvalRows.some(
    row => row.status === "fail" && toolRiskIds.has(row.id)
  );
  const hasToolEvidence =
    hasToolSummaryCards || toolIoRows.length > 0 || actionRows.length > 0 || s.has_tool_calls;
  const toolSectionTitle =
    hasToolRelatedEvalFailure || hasToolEvidence ? "Tool Evidence" : "Tool Details";

  const failedCount = displayEvalRows.filter(r => r.status === "fail").length;
  const passedCount = displayEvalRows.filter(r => r.status === "pass").length;
  const riskSummary = React.useMemo(
    () =>
      buildSnapshotRiskSummary({
        evalRows: displayEvalRows,
        latencyMs: s.latency_ms,
      }),
    [displayEvalRows, s.latency_ms]
  );
  const isSafeSummary = riskSummary.level === "safe";
  const prioritizedEvalRows = React.useMemo(
    () =>
      [...displayEvalRows].sort((a, b) => {
        const priority = (status: string) =>
          status === "fail" ? 0 : status === "pass" ? 1 : 2;
        return priority(a.status) - priority(b.status);
      }),
    [displayEvalRows]
  );

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
          <div className="flex flex-col gap-12 shrink-0">
            <SnapshotRiskHero summary={riskSummary} releaseGateHref={releaseGateHref} />

            <div className="space-y-8">
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <AlignLeft className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">
                    Captured Response
                  </span>
                </div>
                <div className="bg-[#022c22]/20 border border-emerald-500/20 rounded-[20px] p-6 text-sm text-emerald-200 font-mono leading-relaxed whitespace-pre-wrap selection:bg-emerald-500/30 overflow-x-auto shadow-inner">
                  {safeStringify(s.response_text ?? s.response)}
                </div>
              </div>

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
                      Evaluation Evidence
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
                {displayEvalRows.length > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
                      {useOverride ? "Results from replay or override" : "Results from captured snapshot"}
                    </span>
                    <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/90">
                      Thresholds from current saved settings
                    </span>
                  </div>
                ) : null}
                {isSafeSummary ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
                      All checks passed.
                    </div>
                    <details className="group rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03]">
                      <summary className="list-none cursor-pointer rounded-2xl px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111216]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span>View checks</span>
                            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                              Expand
                            </span>
                          </div>
                          <ChevronDown
                            className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                            aria-hidden="true"
                          />
                        </div>
                      </summary>
                      <div className="border-t border-white/5 p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {effectiveEvalEnabled &&
                            prioritizedEvalRows.map(row => {
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
                                    title={getEvalCheckLabel(row.id)}
                                  >
                                    {getEvalCheckLabel(row.id, row.id)}
                                  </span>
                                  <div className="flex-1" />
                                  {(detail.actualStr !== "?" || detail.configStr !== "?") && (
                                    <div className="flex flex-col items-center gap-1 text-xs font-mono mb-2">
                                      {detail.actualStr !== "?" ? (
                                        <span className={clsx(isSavedAppearance ? "text-slate-400" : "text-slate-300")}>
                                          {detail.actualStr}
                                        </span>
                                      ) : null}
                                      {detail.configStr !== "?" ? (
                                        <span className="text-[10px] text-slate-500">
                                          {detail.actualStr !== "?"
                                            ? `Threshold: ${detail.configStr}`
                                            : detail.configStr}
                                        </span>
                                      ) : null}
                                    </div>
                                  )}
                                  <span
                                    className={clsx(
                                      "px-3 py-1 text-xs font-black uppercase tracking-widest rounded-xl w-full",
                                      row.status === "pass"
                                        ? isSavedAppearance
                                          ? "bg-emerald-500/20 text-emerald-300"
                                          : "bg-emerald-500/10 text-emerald-400"
                                        : "bg-slate-500/10 text-slate-500"
                                    )}
                                  >
                                    {formatEvalStatus(row.status)}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {effectiveEvalEnabled &&
                      prioritizedEvalRows.map(row => {
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
                            title={getEvalCheckLabel(row.id)}
                          >
                            {getEvalCheckLabel(row.id, row.id)}
                          </span>
                          <div className="flex-1" />
                          {(detail.actualStr !== "?" || detail.configStr !== "?") && (
                            <div className="flex flex-col items-center gap-1 text-xs font-mono mb-2">
                              {detail.actualStr !== "?" ? (
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
                              ) : null}
                              {detail.configStr !== "?" ? (
                                <span className="text-[10px] text-slate-500">
                                  {detail.actualStr !== "?"
                                    ? `Threshold: ${detail.configStr}`
                                    : detail.configStr}
                                </span>
                              ) : null}
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
                )}
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
                    Result source: snapshot at capture time. Threshold text below uses the current saved
                    evaluation settings, so it may differ if settings changed later.
                  </p>
                ) : null}
                {useOverride && displayEvalRows.length > 0 ? (
                  <p className="text-[11px] text-slate-500 text-center leading-relaxed px-1">
                    Result source: replay or override context. Threshold text below uses the current saved
                    evaluation settings.
                  </p>
                ) : null}
              </div>

              <details className="group rounded-[24px] border border-white/5 bg-[#0f1115] shadow-inner">
                <summary className="list-none cursor-pointer rounded-[24px] px-6 py-5 transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111216]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <SlidersHorizontal className="h-5 w-5 text-fuchsia-400" />
                        <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                          Technical Details
                        </span>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-slate-500">
                        Request structure, captured context, and execution traces for deeper inspection.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 pt-0.5">
                      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">
                        Expand
                      </span>
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </summary>
                <div className="px-6 pb-6 flex flex-col gap-6">

                <div className="rounded-[20px] border border-white/5 bg-black/10 p-6 shadow-inner">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <SlidersHorizontal className="h-5 w-5 text-fuchsia-400" />
                  <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                    Request Overview
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

              <div className="flex flex-col gap-5 rounded-[24px] border border-white/5 bg-[#0f1115] p-6 shadow-inner">
                <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                  <Wrench className="w-5 h-5 text-amber-500" />
                  <span className="text-sm font-bold text-slate-200 uppercase tracking-widest">
                    {toolSectionTitle}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-500">
                  Captured tool calls, tool I/O, and outbound actions for this run.
                </p>

                <div className="space-y-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tool Calls
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
                      title="Tool Timeline"
                      icon={Terminal}
                      variant="snapshot"
                    />
                  ) : (
                    <>
                      <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                        <Terminal className="h-5 w-5 text-sky-400" aria-hidden />
                        <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                          Tool Timeline
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
                      title="Actions"
                      subtitle="Outbound effects such as email, Slack, or HTTP."
                      icon={Send}
                      variant="snapshot"
                    />
                  ) : (
                    <>
                      <div className="flex flex-col gap-1 border-b border-white/5 pb-3">
                        <div className="flex items-center gap-3">
                          <Send className="h-5 w-5 text-sky-400" aria-hidden />
                          <span className="text-sm font-bold uppercase tracking-widest text-slate-200">
                            Actions
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 pl-8">
                          Outbound effects such as email, Slack, or HTTP.
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
              </details>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default SnapshotDetailModal;
