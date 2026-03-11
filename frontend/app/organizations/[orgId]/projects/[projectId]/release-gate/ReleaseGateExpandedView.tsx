"use client";

import React, { useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronDown, Flag, RefreshCcw, ShieldCheck, ShieldX } from "lucide-react";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { sanitizePayloadForPreview } from "./ReleaseGatePageContent";
import { ReleaseGateConfigPanel } from "./ReleaseGateConfigPanel";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import {
  SnapshotDetailModal,
  type SnapshotForDetail,
} from "@/components/shared/SnapshotDetailModal";
import { ClientPortal } from "@/components/shared/ClientPortal";

type GateTab = "validate" | "history";
type ThresholdPreset = "strict" | "default" | "lenient" | "custom";

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
  tool_use_policy: "Tool Use Policy",
};

function getEvalCheckParams(id: string, config: Record<string, unknown> | undefined): string {
  if (!config || typeof config !== "object") return "";
  const c = config as Record<string, unknown>;
  switch (id) {
    case "latency": {
      const w = c.warn_ms;
      const v = c.crit_ms;
      const parts: string[] = [];
      if (typeof w === "number") parts.push(`warn_ms: ${w}`);
      if (typeof v === "number") parts.push(`crit_ms: ${v}`);
      return parts.join(", ");
    }
    case "json":
      return typeof c.mode === "string" ? `mode: ${c.mode}` : "";
    case "status_code": {
      const w = c.warn_from;
      const v = c.crit_from;
      const parts: string[] = [];
      if (typeof w === "number") parts.push(`warn_from: ${w}`);
      if (typeof v === "number") parts.push(`crit_from: ${v}`);
      return parts.join(", ");
    }
    case "empty":
      return typeof c.min_chars === "number" ? `min_chars: ${c.min_chars}` : "";
    case "length":
      return (
        [c.warn_ratio, c.crit_ratio]
          .filter(Number.isFinite)
          .map((r, i) => `${i ? "crit" : "warn"}_ratio: ${r}`)
          .join(", ") || ""
      );
    case "repetition":
      return [c.warn_line_repeats, c.crit_line_repeats].filter(Number.isFinite).length
        ? `warn_line_repeats: ${c.warn_line_repeats ?? "—"}, crit_line_repeats: ${c.crit_line_repeats ?? "—"}`
        : "";
    default:
      return "";
  }
}

function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortText(value: unknown, fallback = "—", max = 96): string {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function percentFromRate(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${Math.round(num * 100)}%`;
}

function formatDurationMs(value: unknown): string {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function MetricTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border p-3",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10",
        tone === "danger" && "border-rose-500/20 bg-rose-500/10",
        tone === "default" && "border-white/8 bg-black/30"
      )}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function HistoryDetailCard({
  item,
  report,
  onClose,
}: {
  item: any;
  report: any;
  onClose?: () => void;
}) {
  const summary =
    report?.summary && typeof report.summary === "object" && !Array.isArray(report.summary)
      ? (report.summary as Record<string, unknown>)
      : null;
  const gateSummaryRaw = summary?.release_gate;
  const gateSummary =
    gateSummaryRaw && typeof gateSummaryRaw === "object" && !Array.isArray(gateSummaryRaw)
      ? (gateSummaryRaw as Record<string, unknown>)
      : null;
  const thresholdsRaw =
    item?.thresholds && typeof item.thresholds === "object" && !Array.isArray(item.thresholds)
      ? (item.thresholds as Record<string, unknown>)
      : gateSummary?.thresholds &&
          typeof gateSummary.thresholds === "object" &&
          !Array.isArray(gateSummary.thresholds)
        ? (gateSummary.thresholds as Record<string, unknown>)
        : null;
  const violations = Array.isArray(report?.violations)
    ? (report.violations as Array<Record<string, unknown>>)
    : [];
  const totalInputs =
    Number(gateSummary?.total_inputs ?? 0) ||
    Number(item?.passed_runs ?? 0) + Number(item?.failed_runs ?? 0);
  const failedInputs = Number(gateSummary?.failed_inputs ?? item?.failed_runs ?? 0);
  const flakyInputs = Number(gateSummary?.flaky_inputs ?? 0);
  const repeatRuns = Number(item?.repeat_runs ?? gateSummary?.repeat_runs ?? 0) || "—";

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/30 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div
            className={clsx(
              "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em]",
              item?.status === "pass"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            )}
          >
            {item?.status === "pass" ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldX className="h-3.5 w-3.5" />
            )}
            {item?.status === "pass" ? "Passed" : "Failed"}
          </div>
          <div className="mt-3 text-lg font-black tracking-tight text-white">Run detail</div>
          <div className="mt-1 text-xs text-slate-400">{formatDateTime(item?.created_at)}</div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/5"
          >
            Close
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricTile label="Repeats" value={repeatRuns} />
        <MetricTile label="Inputs" value={totalInputs || "—"} />
        <MetricTile
          label="Failed inputs"
          value={failedInputs}
          tone={failedInputs > 0 ? "danger" : "default"}
        />
        <MetricTile label="Flaky inputs" value={flakyInputs} />
      </div>

      <div className="space-y-2 text-xs">
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Trace ID
          </div>
          <div className="mt-1 break-all text-slate-200">
            {item?.trace_id || report?.trace_id || "—"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Baseline trace
          </div>
          <div className="mt-1 break-all text-slate-200">
            {item?.baseline_trace_id || report?.baseline_run_ref || "—"}
          </div>
        </div>
      </div>

      {gateSummary && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
            Fail rate {percentFromRate(gateSummary.fail_rate)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
            Flaky rate {percentFromRate(gateSummary.flaky_rate)}
          </span>
          {typeof gateSummary.ratio_band === "string" && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-200">
              Band {gateSummary.ratio_band}
            </span>
          )}
        </div>
      )}

      {thresholdsRaw && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
            Thresholds
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-200">
            {typeof thresholdsRaw.fail_rate_max !== "undefined" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
                Fail max {percentFromRate(thresholdsRaw.fail_rate_max)}
              </span>
            )}
            {typeof thresholdsRaw.flaky_rate_max !== "undefined" && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1">
                Flaky max {percentFromRate(thresholdsRaw.flaky_rate_max)}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
          Violations
        </div>
        {violations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
            No stored violations for this run.
          </div>
        ) : (
          <div className="space-y-2">
            {violations.slice(0, 5).map((violation, idx) => (
              <div
                key={`${String(violation.rule_id ?? idx)}-${idx}`}
                className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm font-semibold text-slate-100">
                    {String(violation.rule_name ?? violation.rule_id ?? `Violation ${idx + 1}`)}
                  </div>
                  {typeof violation.severity === "string" && (
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-black uppercase text-slate-300">
                      {violation.severity}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {String(violation.message ?? "No message")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReleaseGateExpandedView() {
  const ctx = useContext(ReleaseGatePageContext) as Record<string, unknown>;

  const orgId = ctx.orgId as string;
  const projectId = ctx.projectId as number;
  const project = ctx.project as { name?: string } | undefined;
  const tab = ctx.tab as GateTab;
  const setTab = ctx.setTab as (t: GateTab) => void;
  const setViewMode = ctx.setViewMode as (m: "map" | "expanded") => void;
  const setAgentId = ctx.setAgentId as (s: string) => void;
  const setSelectedAgent = ctx.setSelectedAgent as (a: any) => void;
  const setDatasetIds = ctx.setDatasetIds as (a: string[]) => void;
  const setSnapshotIds = ctx.setSnapshotIds as (a: string[]) => void;
  const setRunSnapshotIds = ctx.setRunSnapshotIds as React.Dispatch<React.SetStateAction<string[]>>;
  const setRunDatasetIds = ctx.setRunDatasetIds as React.Dispatch<React.SetStateAction<string[]>>;
  const setExpandedDatasetId = ctx.setExpandedDatasetId as React.Dispatch<
    React.SetStateAction<string | null>
  >;
  const selectedAgent = ctx.selectedAgent as {
    agent_id: string;
    display_name?: string;
    model?: string;
  } | null;
  const agents = ctx.agents as any[];
  const agentsLoaded = Boolean(ctx.agentsLoaded);
  const onMapSelectAgent = ctx.onMapSelectAgent as (id: string) => void;
  const requestSystemPrompt = ctx.requestSystemPrompt as string;
  const runDataPrompt = (ctx.runDataPrompt as string) ?? "";
  const baselineSeedSnapshot = (ctx.baselineSeedSnapshot as Record<string, unknown> | null) ?? null;
  const baselinePayload = (ctx.baselinePayload as Record<string, unknown> | null) ?? null;
  const nodeBasePayload = (ctx.nodeBasePayload as Record<string, unknown> | null) ?? null;
  const configSourceLabel = (ctx.configSourceLabel as string) || "";
  const recentSnapshots = ctx.recentSnapshots as any[];
  const baselineSnapshotsById = ctx.baselineSnapshotsById as Map<string, Record<string, unknown>>;
  const runSnapshotIds = ctx.runSnapshotIds as string[];
  const setDataSource = ctx.setDataSource as (s: "recent" | "datasets") => void;
  const snapshotEvalFailed = ctx.snapshotEvalFailed as (
    s: Record<string, unknown> | null
  ) => boolean;
  const setBaselineDetailSnapshot = ctx.setBaselineDetailSnapshot as (
    s: SnapshotForDetail | null
  ) => void;
  const datasets = ctx.datasets as {
    id: string;
    label?: string;
    snapshot_count?: number;
    snapshot_ids?: unknown[];
  }[];
  const runDatasetIds = ctx.runDatasetIds as string[];
  const expandedDatasetId = ctx.expandedDatasetId as string | null;
  const expandedDatasetSnapshots = ctx.expandedDatasetSnapshots as Record<string, unknown>[];
  const selectedBaselineCount = ctx.selectedBaselineCount as number;
  const selectedDataSummary = ctx.selectedDataSummary as string;
  const thresholdPreset = ctx.thresholdPreset as ThresholdPreset;
  const setThresholdPreset = ctx.setThresholdPreset as (k: ThresholdPreset) => void;
  const normalizeGateThresholds = ctx.normalizeGateThresholds as (
    a: unknown,
    b: unknown
  ) => { failRateMax: number; flakyRateMax: number };
  const failRateMax = Number(ctx.failRateMax ?? 0);
  const setFailRateMax = ctx.setFailRateMax as (n: number) => void;
  const flakyRateMax = Number(ctx.flakyRateMax ?? 0);
  const setFlakyRateMax = ctx.setFlakyRateMax as (n: number) => void;
  const newModel = ctx.newModel as string;
  const setNewModel = ctx.setNewModel as (s: string) => void;
  const modelOverrideEnabled = Boolean(ctx.modelOverrideEnabled);
  const setModelOverrideEnabled = ctx.setModelOverrideEnabled as (b: boolean) => void;
  const replayProvider = String(ctx.replayProvider ?? "")
    .trim()
    .toLowerCase();
  const requestBody = ctx.requestBody as Record<string, unknown>;
  const setRequestBody = ctx.setRequestBody as React.Dispatch<
    React.SetStateAction<Record<string, unknown>>
  >;
  const applySystemPromptToBody = ctx.applySystemPromptToBody as (
    b: Record<string, unknown>,
    s: string
  ) => Record<string, unknown>;
  const repeatRuns = ctx.repeatRuns as number;
  const setRepeatRuns = ctx.setRepeatRuns as (n: number) => void;
  const repeatDropdownOpen = ctx.repeatDropdownOpen as boolean;
  const setRepeatDropdownOpen = ctx.setRepeatDropdownOpen as (b: boolean) => void;
  const repeatDropdownRef = ctx.repeatDropdownRef as React.RefObject<HTMLDivElement>;
  const REPEAT_OPTIONS = ctx.REPEAT_OPTIONS as readonly number[];
  const isHeavyRepeat = Boolean(ctx.isHeavyRepeat);
  const canRunValidate = ctx.canRunValidate as boolean;
  const keyBlocked = Boolean(ctx.keyBlocked);
  const keyRegistrationMessage = (ctx.keyRegistrationMessage as string) || "";
  const isValidating = ctx.isValidating as boolean;
  const activeJobId = (ctx.activeJobId as string | null) ?? null;
  const cancelRequested = Boolean(ctx.cancelRequested);
  const handleValidate = ctx.handleValidate as () => void;
  const handleCancelActiveJob =
    (ctx.handleCancelActiveJob as (() => void) | undefined) ?? undefined;
  const runError = (ctx.error as string) || "";
  const result = ctx.result as any;
  const expandedCaseIndex = ctx.expandedCaseIndex as number | null;
  const setExpandedCaseIndex = ctx.setExpandedCaseIndex as (n: number | null) => void;
  const selectedAttempt = ctx.selectedAttempt as { caseIndex: number; attemptIndex: number } | null;
  const setSelectedAttempt = ctx.setSelectedAttempt as (
    a: { caseIndex: number; attemptIndex: number } | null
  ) => void;
  const baselineDetailSnapshot = ctx.baselineDetailSnapshot as SnapshotForDetail | null;
  const agentEvalData = ctx.agentEvalData as Record<string, unknown> | undefined;
  const runEvalElements = (ctx.runEvalElements as Array<{ name: string }>) ?? [];
  const historyStatus = ctx.historyStatus as "all" | "pass" | "fail";
  const setHistoryStatus = ctx.setHistoryStatus as (s: "all" | "pass" | "fail") => void;
  const historyTraceId = ctx.historyTraceId as string;
  const setHistoryTraceId = ctx.setHistoryTraceId as (s: string) => void;
  const historyOffset = ctx.historyOffset as number;
  const setHistoryOffset = ctx.setHistoryOffset as (n: number | ((v: number) => number)) => void;
  const historyLimit = ctx.historyLimit as number;
  const historyLoading = ctx.historyLoading as boolean;
  const historyItems = ctx.historyItems as any[];
  const historyTotal = ctx.historyTotal as number;
  const mutateHistory = ctx.mutateHistory as () => void;
  const selectedRunId = ctx.selectedRunId as string | null;
  const setSelectedRunId = ctx.setSelectedRunId as (id: string | null) => void;
  const selectedRunReport = ctx.selectedRunReport as any;
  const setExpandedHistoryId = ctx.setExpandedHistoryId as
    | ((id: string | null) => void)
    | undefined;
  const runDataProvider = ctx.runDataProvider as string;
  const runDataModel = ctx.runDataModel as string;
  const projectName = project?.name;
  const REPLAY_THRESHOLD_PRESETS = ctx.REPLAY_THRESHOLD_PRESETS as Record<
    string,
    { label: string; failRateMax: number; flakyRateMax: number }
  >;

  const agentId = selectedAgent?.agent_id ?? "";
  const [dataPanelTab, setDataPanelTab] = useState<"logs" | "datasets">("logs");
  const [rightPanelTab, setRightPanelTab] = useState<"results" | "history">("results");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const requestTools = useMemo(
    () => (Array.isArray(requestBody.tools) ? requestBody.tools : []),
    [requestBody]
  );
  const resultCases = useMemo(() => {
    if (Array.isArray(result?.run_results)) return result.run_results;
    if (Array.isArray(result?.case_results)) return result.case_results;
    return [];
  }, [result]);
  const nodeHistoryItems = useMemo(
    () =>
      historyItems.filter(item => {
        const itemAgentId = String(item?.agent_id ?? "").trim();
        return !itemAgentId || itemAgentId === agentId;
      }),
    [agentId, historyItems]
  );
  const selectedHistoryItem = useMemo(
    () => historyItems.find(item => item.id === selectedRunId) ?? null,
    [historyItems, selectedRunId]
  );

  useEffect(() => {
    setDataPanelTab("logs");
    setRightPanelTab("results");
    setSettingsPanelOpen(false);
    setExpandedCaseIndex(null);
    setSelectedAttempt(null);
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  }, [agentId, setExpandedCaseIndex, setRepeatDropdownOpen, setSelectedAttempt, setSelectedRunId]);

  const handleBack = () => {
    setViewMode("map");
    setAgentId("");
    setSelectedAgent(null);
    setDatasetIds([]);
    setSnapshotIds([]);
    setRunSnapshotIds([]);
    setRunDatasetIds([]);
    setExpandedDatasetId(null);
    setExpandedCaseIndex(null);
    setSelectedAttempt(null);
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  };

  const selectHistoryRun = (id: string) => {
    setSelectedRunId(id);
    setExpandedHistoryId?.(id);
  };

  const handleRepeatSelect = (runs: number) => {
    if (isValidating || activeJobId) return;
    if ((runs === 50 || runs === 100) && typeof window !== "undefined") {
      const approved = window.confirm(
        `${runs}x repeat runs are heavier and slower. Continue with the stability check?`
      );
      if (!approved) return;
    }
    setRepeatRuns(runs);
    setRepeatDropdownOpen(false);
  };

  const runLocked = isValidating || Boolean(activeJobId);

  const activeChecksCards = useMemo(() => {
    const configSrc = agentEvalData?.config as Record<string, unknown> | undefined;
    return runEvalElements.map((e: { name: string }) => {
      const id = e.name;
      const label =
        EVAL_CHECK_LABELS[id] ??
        id.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
      const checkConfig = configSrc?.[id] as Record<string, unknown> | undefined;
      const params = getEvalCheckParams(id, checkConfig);
      return { id, label, params };
    });
  }, [agentEvalData?.config, runEvalElements]);

  const toolsCount = Array.isArray(requestTools) ? requestTools.length : 0;
  const samplingTemperature =
    typeof (requestBody as any)?.temperature === "number"
      ? (requestBody as any).temperature
      : undefined;
  const samplingMaxTokens =
    typeof (requestBody as any)?.max_tokens === "number"
      ? (requestBody as any).max_tokens
      : undefined;
  const samplingTopP =
    typeof (requestBody as any)?.top_p === "number" ? (requestBody as any).top_p : undefined;
  const samplingSummary =
    samplingTemperature == null && samplingMaxTokens == null && samplingTopP == null
      ? "Using provider defaults"
      : [
          samplingTemperature != null ? `Temp ${samplingTemperature}` : null,
          samplingMaxTokens != null ? `Max ${samplingMaxTokens}` : null,
          samplingTopP != null ? `Top p ${samplingTopP}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const toolsSummary =
    toolsCount > 0
      ? `${toolsCount} tool${toolsCount === 1 ? "" : "s"} configured`
      : "No tools configured";
  const isPinnedAnthropic = (modelId: unknown) => /-\d{8}$/.test(String(modelId ?? "").trim());
  const overrideSummary = modelOverrideEnabled
    ? (() => {
        // This summary is displayed on the node card, so keep it compact.
        if (replayProvider === "anthropic") {
          return isPinnedAnthropic(newModel) ? "Pinned override" : "Custom override";
        }
        return "Override active";
      })()
    : "Using detected model";
  const lastRunStatusLabel = useMemo(() => {
    if (isValidating) return cancelRequested ? "Canceling" : "Running";
    if (runError) return "Failed";
    if (typeof result?.pass === "boolean") return result.pass ? "Passed" : "Failed";
    return "";
  }, [isValidating, cancelRequested, runError, result]);
  const originalPayloadPreview = useMemo(() => {
    const rawSource =
      baselinePayload ??
      (baselineSeedSnapshot?.payload &&
      typeof baselineSeedSnapshot.payload === "object" &&
      !Array.isArray(baselineSeedSnapshot.payload)
        ? (baselineSeedSnapshot.payload as Record<string, unknown>)
        : null) ??
      nodeBasePayload;
    const clean = sanitizePayloadForPreview(rawSource);
    try {
      return JSON.stringify(clean, null, 2);
    } catch {
      return "{}";
    }
  }, [baselinePayload, baselineSeedSnapshot, nodeBasePayload]);

  const rgDetails = agentId
    ? {
        provider: runDataProvider,
        model: runDataModel,
        prompt: String(requestSystemPrompt || runDataPrompt || "").trim(),
        toolsCount,
        activeChecks: runEvalElements.map((e: { name: string }) => e.name),
        activeChecksCards,
        strictnessLabel: REPLAY_THRESHOLD_PRESETS[thresholdPreset]?.label ?? thresholdPreset,
        failRateMax,
        flakyRateMax,
        config: {
          lastRunWallMs: result?.perf?.total_wall_ms ?? null,
          lastRunStatusLabel,
          configSourceLabel,
          selectedBaselineCount,
          selectedDataSummary,
          samplingSummary,
          toolsSummary,
          overrideSummary,
          originalPayloadPreview,
          runError,
          repeatRuns,
          repeatDropdownOpen,
          setRepeatDropdownOpen,
          repeatDropdownRef,
          REPEAT_OPTIONS,
          isHeavyRepeat,
          canRunValidate,
          keyBlocked,
          keyRegistrationMessage,
          isValidating,
          handleValidate,
          activeJobId,
          cancelRequested,
          handleCancel: handleCancelActiveJob,
          handleRepeatSelect,
          modelOverrideEnabled,
          openSettings: () => setSettingsPanelOpen(true),
        },
      }
    : null;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="absolute inset-0">
        <ReleaseGateMap
          agents={agents}
          agentsLoaded={agentsLoaded}
          onSelectAgent={onMapSelectAgent}
          projectName={projectName}
          selectedNodeId={agentId || null}
          rgDetails={rgDetails}
        />
      </div>
      <div className="absolute inset-0 z-[9999] pointer-events-none overflow-y-auto">
        <div className="absolute top-6 left-6 right-6 flex items-start justify-end pointer-events-none z-[10000]">
          <div className="mt-[70px] flex rounded-2xl border border-white/10 bg-[#1a1a1e]/90 p-1.5 shadow-2xl pointer-events-auto">
            <button
              onClick={() => setTab("validate")}
              className={clsx(
                "px-6 py-2 text-xs font-bold rounded-xl transition-all duration-300",
                tab === "validate"
                  ? "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/30 shadow-[0_0_20px_rgba(217,70,239,0.2)]"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              VALIDATE
            </button>
            <button
              onClick={() => setTab("history")}
              className={clsx(
                "px-6 py-2 text-xs font-bold rounded-xl transition-all duration-300",
                tab === "history"
                  ? "bg-fuchsia-500/20 text-fuchsia-100 border border-fuchsia-500/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
              )}
            >
              HISTORY
            </button>
          </div>
        </div>

        {tab === "validate" && agentId && (
          <ClientPortal>
            <RailwaySidePanel
              title={selectedAgent?.display_name || agentId}
              isOpen={true}
              onClose={handleBack}
              side="left"
              width={420}
              showCloseButton={false}
              className="pointer-events-auto"
              tabs={[
                { id: "logs", label: "Live Logs" },
                { id: "datasets", label: "Saved Data" },
              ]}
              activeTab={dataPanelTab}
              onTabChange={id => setDataPanelTab(id as "logs" | "datasets")}
            >
              <div className="flex h-full flex-col">
                {dataPanelTab === "logs" && (
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {!recentSnapshots?.length ? (
                      <div className="p-8 text-center">
                        <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
                          No recent snapshots
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500">
                          Send traffic to this node in Live View to load baseline logs.
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/[0.03]">
                        {recentSnapshots.map(
                          (skinny: { id: string; trace_id?: string; created_at?: string }) => {
                            const full = baselineSnapshotsById.get(String(skinny.id)) as
                              | Record<string, unknown>
                              | undefined;
                            const snap = (full ?? skinny) as Record<string, unknown>;
                            const checked = runSnapshotIds.includes(String(skinny.id));
                            const failed = snapshotEvalFailed(full ?? null);
                            return (
                              <div
                                key={skinny.id}
                                className={clsx(
                                  "group transition-colors",
                                  checked ? "bg-fuchsia-500/5" : "hover:bg-white/[0.02]"
                                )}
                              >
                                <div
                                  className="flex cursor-pointer items-start gap-3 p-4"
                                  onClick={() =>
                                    setBaselineDetailSnapshot(snap as unknown as SnapshotForDetail)
                                  }
                                >
                                  <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={runLocked}
                                      onChange={() => {
                                        if (runLocked) return;
                                        const id = String(skinny.id);
                                        setRunSnapshotIds(prev =>
                                          prev.includes(id)
                                            ? prev.filter(x => x !== id)
                                            : [...prev, id]
                                        );
                                        setDataSource("recent");
                                        setRunDatasetIds([]);
                                      }}
                                      className="h-4 w-4 rounded border-white/10 bg-black/40 text-fuchsia-500"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1 space-y-1">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="font-mono text-[11px] font-bold text-slate-300">
                                        {formatDateTime(snap.created_at)}
                                      </span>
                                      <span
                                        className={clsx(
                                          "rounded border px-2 py-0.5 text-[9px] font-black uppercase",
                                          failed
                                            ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                                            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                        )}
                                      >
                                        {failed ? "FAIL" : "PASS"}
                                      </span>
                                    </div>
                                    <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-300">
                                      {shortText(
                                        snap.user_message ?? snap.request_prompt ?? "—",
                                        "—",
                                        90
                                      )}
                                    </p>
                                    {Boolean(snap.trace_id) && (
                                      <p className="truncate text-[11px] text-slate-500">
                                        Trace {String(snap.trace_id)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                )}

                {dataPanelTab === "datasets" && (
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                    {!datasets?.length ? (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[12px] text-slate-500">
                        No saved datasets.
                        <div className="mt-2">
                          <Link
                            href={`/organizations/${orgId}/projects/${projectId}/live-view`}
                            className="text-fuchsia-400 hover:text-fuchsia-300"
                          >
                            Go to Live View (DATA tab)
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {datasets.map(
                          (dataset: {
                            id: string;
                            label?: string;
                            snapshot_count?: number;
                            snapshot_ids?: unknown[];
                          }) => {
                            const id = dataset.id;
                            const label = dataset.label || id;
                            const count =
                              typeof dataset.snapshot_count === "number"
                                ? dataset.snapshot_count
                                : Array.isArray(dataset.snapshot_ids)
                                  ? dataset.snapshot_ids.length
                                  : 0;
                            const checked = runDatasetIds.includes(id);
                            const isExpanded = expandedDatasetId === id;
                            return (
                              <div
                                key={id}
                                className={clsx(
                                  "overflow-hidden rounded-[22px] border transition-all",
                                  checked
                                    ? "border-fuchsia-500/25 bg-fuchsia-500/8 shadow-[0_18px_40px_rgba(217,70,239,0.08)]"
                                    : "border-white/8 bg-white/[0.04]"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setExpandedDatasetId(isExpanded ? null : id)}
                                  className="flex w-full items-start gap-3 px-4 py-4 text-left"
                                >
                                  <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={runLocked}
                                      onChange={e => {
                                        e.stopPropagation();
                                        if (runLocked) return;
                                        setRunDatasetIds(prev =>
                                          prev.includes(id)
                                            ? prev.filter(x => x !== id)
                                            : [...prev, id]
                                        );
                                        setDataSource("datasets");
                                        setRunSnapshotIds([]);
                                      }}
                                      className="mt-0.5 h-4 w-4 rounded border-white/10 bg-black/40 text-fuchsia-500"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="truncate text-[13px] font-semibold text-slate-100">
                                          {label}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-300">
                                          Saved baseline bundle for this node. Expand to inspect the
                                          snapshots inside.
                                        </div>
                                      </div>
                                      <div className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[11px] text-slate-200">
                                        {count} snapshots
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronDown
                                    className={clsx(
                                      "mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                </button>

                                {isExpanded && (
                                  <div className="px-4 pb-4">
                                    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04]">
                                      {expandedDatasetSnapshots.length === 0 ? (
                                        <div className="px-4 py-4 text-sm text-slate-500">
                                          No snapshots stored in this dataset.
                                        </div>
                                      ) : (
                                        expandedDatasetSnapshots.map(snapshot => (
                                          <button
                                            key={String(snapshot.id)}
                                            type="button"
                                            onClick={() =>
                                              setBaselineDetailSnapshot(
                                                snapshot as unknown as SnapshotForDetail
                                              )
                                            }
                                            className="flex w-full items-start justify-between gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.05]"
                                          >
                                            <div className="min-w-0 flex-1">
                                              <div className="truncate text-[13px] font-medium text-slate-100">
                                                {shortText(
                                                  snapshot.user_message ??
                                                    snapshot.request_prompt ??
                                                    "—",
                                                  "—",
                                                  88
                                                )}
                                              </div>
                                              <div className="mt-1 text-[11px] text-slate-400">
                                                {formatDateTime(snapshot.created_at)}
                                              </div>
                                            </div>
                                            <div className="shrink-0 text-[11px] text-slate-500">
                                              {String(snapshot.trace_id ?? "").slice(0, 12) ||
                                                "trace"}
                                            </div>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </RailwaySidePanel>

            <RailwaySidePanel
              title=""
              isOpen={true}
              onClose={handleBack}
              side="right"
              width={420}
              showCloseButton={true}
              className="pointer-events-auto"
              tabs={[
                { id: "results", label: "Results" },
                { id: "history", label: "History" },
              ]}
              activeTab={rightPanelTab}
              onTabChange={id => {
                const next = id as "results" | "history";
                setRightPanelTab(next);
                if (next === "history" && !selectedRunId && nodeHistoryItems[0]?.id) {
                  selectHistoryRun(String(nodeHistoryItems[0].id));
                }
              }}
            >
              <div className="flex h-full flex-col overflow-y-auto custom-scrollbar">
                {rightPanelTab === "results" && (
                  <div className="flex-1 space-y-4 p-4">
                    {!result ? (
                      <div className="flex flex-col items-center justify-center py-14 text-center opacity-70">
                        <Activity className="mb-4 h-8 w-8 text-slate-400" />
                        <div className="text-sm font-black uppercase text-slate-300">
                          Awaiting run
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Choose baseline data, adjust the settings below the node, then press
                          Start.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div
                          className={clsx(
                            "rounded-[24px] border px-4 py-3",
                            result.pass
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          )}
                        >
                          <div className="text-[10px] font-black uppercase tracking-[0.18em]">
                            Current gate result
                          </div>
                          <div className="mt-1 text-lg font-black">
                            {result.pass ? "Passed" : "Failed"}
                          </div>
                          {typeof result.summary === "string" && result.summary.trim() && (
                            <p className="mt-2 text-sm leading-relaxed text-white/80">
                              {result.summary}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <MetricTile
                            label="Failure rate"
                            value={percentFromRate(result.fail_rate)}
                            tone={result.pass ? "success" : "danger"}
                          />
                          <MetricTile
                            label="Flaky rate"
                            value={percentFromRate(result.flaky_rate)}
                          />
                          <MetricTile label="Inputs" value={Number(result.total_inputs ?? 0)} />
                          <MetricTile
                            label="Repeats"
                            value={Number(result.repeat_runs ?? repeatRuns)}
                          />
                        </div>
                        {result?.perf && typeof result.perf === "object" && (
                          <div className="grid grid-cols-2 gap-2">
                            <MetricTile
                              label="Total runtime"
                              value={formatDurationMs((result.perf as any).total_wall_ms)}
                            />
                            <MetricTile
                              label="Avg repeat"
                              value={formatDurationMs((result.perf as any).avg_attempt_wall_ms)}
                            />
                          </div>
                        )}

                        {Array.isArray(result.failure_reasons) &&
                          result.failure_reasons.length > 0 && (
                            <div className="rounded-[24px] border border-white/8 bg-black/30 p-4">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                Why it failed
                              </div>
                              <div className="mt-3 space-y-2">
                                {result.failure_reasons
                                  .slice(0, 6)
                                  .map((reason: string, idx: number) => (
                                    <div
                                      key={`${reason}-${idx}`}
                                      className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-slate-200"
                                    >
                                      {reason}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                              Per-input breakdown
                            </div>
                            {nodeHistoryItems.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setRightPanelTab("history");
                                  if (!selectedRunId && nodeHistoryItems[0]?.id) {
                                    selectHistoryRun(String(nodeHistoryItems[0].id));
                                  }
                                }}
                                className="text-[11px] font-semibold text-slate-300 hover:text-white"
                              >
                                View history
                              </button>
                            )}
                          </div>

                          {resultCases.map((run: any, idx: number) => {
                            const attempts = Array.isArray(run?.attempts) ? run.attempts : [];
                            const passedAttempts = attempts.filter((attempt: any) =>
                              Boolean(attempt?.pass)
                            ).length;
                            const totalAttempts =
                              attempts.length || Number(result.repeat_runs ?? repeatRuns) || 1;
                            const caseStatus = String(
                              run?.case_status ?? (run?.pass ? "pass" : "fail")
                            ).toUpperCase();
                            const isExpanded = expandedCaseIndex === idx;
                            const activeAttempt =
                              selectedAttempt?.caseIndex === idx &&
                              typeof selectedAttempt.attemptIndex === "number"
                                ? attempts[selectedAttempt.attemptIndex]
                                : null;

                            return (
                              <div
                                key={idx}
                                className={clsx(
                                  "overflow-hidden rounded-[24px] border",
                                  run?.pass
                                    ? "border-emerald-500/20 bg-emerald-500/5"
                                    : "border-rose-500/20 bg-rose-500/5"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedCaseIndex(isExpanded ? null : idx);
                                    setSelectedAttempt(null);
                                  }}
                                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                  <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                      Input {idx + 1}
                                    </div>
                                    <div className="mt-1 text-sm font-semibold text-white">
                                      {passedAttempts}/{totalAttempts} passed
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span
                                      className={clsx(
                                        "rounded-full border px-2.5 py-1 text-[10px] font-black uppercase",
                                        run?.pass
                                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                          : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                                      )}
                                    >
                                      {caseStatus}
                                    </span>
                                    <ChevronDown
                                      className={clsx(
                                        "h-4 w-4 text-slate-500 transition-transform",
                                        isExpanded && "rotate-180"
                                      )}
                                    />
                                  </div>
                                </button>

                                {isExpanded && (
                                  <div className="space-y-3 border-t border-white/8 p-4">
                                    {Array.isArray(run?.failure_reasons) &&
                                      run.failure_reasons.length > 0 && (
                                        <div className="rounded-2xl border border-white/8 bg-black/30 p-3">
                                          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                            Case reasons
                                          </div>
                                          <div className="mt-2 space-y-2">
                                            {run.failure_reasons
                                              .slice(0, 4)
                                              .map((reason: string, reasonIdx: number) => (
                                                <div
                                                  key={`${reason}-${reasonIdx}`}
                                                  className="text-sm leading-relaxed text-slate-200"
                                                >
                                                  {reason}
                                                </div>
                                              ))}
                                          </div>
                                        </div>
                                      )}

                                    <div className="space-y-2">
                                      {attempts.length === 0 ? (
                                        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
                                          No per-attempt detail stored for this input.
                                        </div>
                                      ) : (
                                        attempts.map((attempt: any, attemptIdx: number) => {
                                          const isActive =
                                            selectedAttempt?.caseIndex === idx &&
                                            selectedAttempt?.attemptIndex === attemptIdx;
                                          return (
                                            <button
                                              key={attemptIdx}
                                              type="button"
                                              onClick={() =>
                                                setSelectedAttempt(
                                                  isActive
                                                    ? null
                                                    : { caseIndex: idx, attemptIndex: attemptIdx }
                                                )
                                              }
                                              className={clsx(
                                                "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                                                isActive
                                                  ? "border-fuchsia-500/30 bg-fuchsia-500/10"
                                                  : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
                                              )}
                                            >
                                              <div className="min-w-0">
                                                <div className="text-xs font-semibold text-slate-100">
                                                  Attempt {attemptIdx + 1}
                                                </div>
                                                <div className="mt-1 truncate text-[11px] text-slate-400">
                                                  {shortText(
                                                    attempt?.trace_id ?? "No trace id",
                                                    "No trace id",
                                                    54
                                                  )}
                                                </div>
                                              </div>
                                              <span
                                                className={clsx(
                                                  "rounded-full border px-2 py-1 text-[10px] font-black uppercase",
                                                  attempt?.pass
                                                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                                                    : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                                                )}
                                              >
                                                {attempt?.pass ? "PASS" : "FAIL"}
                                              </span>
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>

                                    {activeAttempt && (
                                      <div className="space-y-3 rounded-2xl border border-white/8 bg-black/30 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="text-sm font-semibold text-white">
                                            Attempt detail
                                          </div>
                                          {activeAttempt.trace_id && (
                                            <div className="truncate text-[11px] text-slate-400">
                                              {String(activeAttempt.trace_id)}
                                            </div>
                                          )}
                                        </div>

                                        {Array.isArray(activeAttempt.failure_reasons) &&
                                          activeAttempt.failure_reasons.length > 0 && (
                                            <div className="space-y-2">
                                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                Failure reasons
                                              </div>
                                              {activeAttempt.failure_reasons
                                                .slice(0, 5)
                                                .map((reason: string, reasonIdx: number) => (
                                                  <div
                                                    key={`${reason}-${reasonIdx}`}
                                                    className="text-sm leading-relaxed text-slate-200"
                                                  >
                                                    {reason}
                                                  </div>
                                                ))}
                                            </div>
                                          )}

                                        {activeAttempt.replay && (
                                          <div className="grid grid-cols-3 gap-2">
                                            <MetricTile
                                              label="Attempted"
                                              value={Number(activeAttempt.replay.attempted ?? 0)}
                                            />
                                            <MetricTile
                                              label="Succeeded"
                                              value={Number(activeAttempt.replay.succeeded ?? 0)}
                                              tone="success"
                                            />
                                            <MetricTile
                                              label="Failed"
                                              value={Number(activeAttempt.replay.failed ?? 0)}
                                              tone={
                                                Number(activeAttempt.replay.failed ?? 0) > 0
                                                  ? "danger"
                                                  : "default"
                                              }
                                            />
                                          </div>
                                        )}

                                        {activeAttempt.replay?.provider_error && (
                                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                Provider error (raw)
                                              </div>
                                              <div className="text-[11px] text-slate-400">
                                                {String(
                                                  activeAttempt.replay.provider_error.provider ??
                                                    "provider"
                                                )}
                                                {typeof activeAttempt.replay.provider_error
                                                  .status_code === "number"
                                                  ? ` · ${activeAttempt.replay.provider_error.status_code}`
                                                  : ""}
                                              </div>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                                              <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2">
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                  Type
                                                </div>
                                                <div className="mt-1">
                                                  {String(
                                                    activeAttempt.replay.provider_error
                                                      .error_type ?? "—"
                                                  )}
                                                </div>
                                              </div>
                                              <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2">
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                                  Code
                                                </div>
                                                <div className="mt-1">
                                                  {String(
                                                    activeAttempt.replay.provider_error
                                                      .error_code ?? "—"
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                            {activeAttempt.replay.provider_error.message ? (
                                              <div className="mt-2 text-sm leading-relaxed text-slate-200">
                                                {String(
                                                  activeAttempt.replay.provider_error.message
                                                )}
                                              </div>
                                            ) : null}
                                            {activeAttempt.replay.provider_error
                                              .response_preview ? (
                                              <pre className="mt-3 max-h-[240px] overflow-auto rounded-xl border border-white/8 bg-black/30 p-3 text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap break-words custom-scrollbar">
                                                {String(
                                                  activeAttempt.replay.provider_error
                                                    .response_preview
                                                )}
                                              </pre>
                                            ) : (
                                              <div className="mt-3 text-[11px] text-slate-500">
                                                No provider response body captured.
                                              </div>
                                            )}
                                          </div>
                                        )}

                                        {activeAttempt.behavior_diff && (
                                          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                                              Behavior diff
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                              <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                                                Sequence edits{" "}
                                                {Number(
                                                  activeAttempt.behavior_diff
                                                    .sequence_edit_distance ?? 0
                                                )}
                                              </div>
                                              <div className="rounded-xl border border-white/8 bg-black/30 px-3 py-2 text-slate-200">
                                                Tool divergence{" "}
                                                {percentFromRate(
                                                  Number(
                                                    activeAttempt.behavior_diff
                                                      .tool_divergence_pct ?? 0
                                                  ) / 100
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {rightPanelTab === "history" && (
                  <div className="flex-1 space-y-4 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                          Experiment history
                        </div>
                        <div className="text-sm font-semibold text-white">
                          Retained runs for this node
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => mutateHistory()}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/5"
                      >
                        <RefreshCcw className="h-3.5 w-3.5" />
                        Refresh
                      </button>
                    </div>

                    {historyLoading ? (
                      <div className="space-y-2">
                        {[1, 2, 3].map(i => (
                          <div
                            key={i}
                            className="h-16 rounded-2xl border border-white/5 bg-white/5 animate-pulse"
                          />
                        ))}
                      </div>
                    ) : nodeHistoryItems.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                        <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
                        <p className="text-sm text-slate-500">
                          No retained history yet for this node.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {nodeHistoryItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => selectHistoryRun(String(item.id))}
                            className={clsx(
                              "flex w-full items-center justify-between gap-3 rounded-[22px] border px-4 py-3 text-left transition",
                              selectedRunId === item.id
                                ? "border-fuchsia-500/30 bg-fuchsia-500/10"
                                : "border-white/8 bg-black/20 hover:bg-white/[0.05]"
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                                {item.status === "pass" ? (
                                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                ) : (
                                  <ShieldX className="h-4 w-4 text-rose-400" />
                                )}
                                <span
                                  className={
                                    item.status === "pass" ? "text-emerald-300" : "text-rose-300"
                                  }
                                >
                                  {item.status === "pass" ? "Passed" : "Failed"}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-[11px] text-slate-400">
                                {shortText(item.trace_id, "No trace id", 54)}
                              </div>
                            </div>
                            <div className="shrink-0 text-[11px] text-slate-500">
                              {formatDateTime(item.created_at)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedHistoryItem ? (
                      <HistoryDetailCard
                        item={selectedHistoryItem}
                        report={selectedRunReport}
                        onClose={() => setSelectedRunId(null)}
                      />
                    ) : nodeHistoryItems.length > 0 ? (
                      <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                        <p className="text-sm text-slate-500">
                          Select a run to inspect thresholds, inputs, and violations.
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </RailwaySidePanel>
          </ClientPortal>
        )}

        <ReleaseGateConfigPanel
          isOpen={settingsPanelOpen && !!agentId}
          onClose={() => setSettingsPanelOpen(false)}
        />

        {tab === "history" && (
          <div className="mx-6 mt-24 space-y-6 rounded-3xl border border-white/5 bg-[#111216] p-7 shadow-xl pointer-events-auto">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={historyStatus}
                onChange={e => {
                  setHistoryStatus(e.target.value as "all" | "pass" | "fail");
                  setHistoryOffset(0);
                }}
                className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
              >
                <option value="all">All</option>
                <option value="pass">Passed</option>
                <option value="fail">Failed</option>
              </select>
              <input
                value={historyTraceId}
                onChange={e => {
                  setHistoryTraceId(e.target.value);
                  setHistoryOffset(0);
                }}
                placeholder="Filter by trace ID"
                className="w-48 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
              />
              <button
                onClick={() => mutateHistory()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Refresh
              </button>
            </div>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-16 rounded-lg border border-white/5 bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : historyItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">No validation history yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-2">
                  {historyItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectHistoryRun(String(item.id))}
                      className={clsx(
                        "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left",
                        selectedRunId === item.id
                          ? "border-fuchsia-500/50 bg-fuchsia-500/10"
                          : "border-white/10 bg-black/20 hover:bg-white/5"
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-100">
                        {item.status === "pass" ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <ShieldX className="h-4 w-4 text-rose-400" />
                        )}
                        <span
                          className={item.status === "pass" ? "text-emerald-400" : "text-rose-400"}
                        >
                          {item.status === "pass" ? "Passed" : "Failed"}
                        </span>
                        <span className="truncate text-slate-400">· {item.trace_id}</span>
                      </div>
                      <div className="text-xs text-slate-400">{item.created_at || "-"}</div>
                    </button>
                  ))}
                </div>
                <div className="lg:col-span-2">
                  {selectedHistoryItem ? (
                    <HistoryDetailCard
                      item={selectedHistoryItem}
                      report={selectedRunReport}
                      onClose={() => setSelectedRunId(null)}
                    />
                  ) : (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                      <p className="text-sm text-slate-500">
                        Select a run from the list to see detail.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs text-slate-400">
              <span>
                {historyTotal} {historyTotal === 1 ? "record" : "records"}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={historyOffset <= 0}
                  onClick={() =>
                    setHistoryOffset((value: number) => Math.max(0, value - historyLimit))
                  }
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  disabled={historyOffset + historyLimit >= historyTotal}
                  onClick={() => setHistoryOffset((value: number) => value + historyLimit)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {baselineDetailSnapshot && (
          <ClientPortal>
            <AnimatePresence>
              <SnapshotDetailModal
                snapshot={baselineDetailSnapshot}
                onClose={() => setBaselineDetailSnapshot(null)}
                overlayZIndex={10000}
                policyState={{ status: "idle" }}
                evalRows={(() => {
                  const snap = baselineDetailSnapshot as unknown as Record<string, unknown> | null;
                  const checks = snap?.eval_checks_result;
                  if (!checks || typeof checks !== "object" || Array.isArray(checks)) return [];
                  return Object.entries(checks).map(([id, status]) => ({
                    id,
                    status: String(status),
                  }));
                })()}
                evalEnabled={true}
                evalContextLabel={(() => {
                  const snap = baselineDetailSnapshot as unknown as Record<string, unknown>;
                  const cur = (agentEvalData as Record<string, unknown> | undefined)
                    ?.current_eval_config_version as string | undefined;
                  const snapVer = snap?.eval_config_version as string | undefined;
                  const stale = cur && snapVer && snapVer !== cur;
                  return stale
                    ? "Eval result from snapshot capture time. Eval config has changed since then."
                    : "Eval result from snapshot capture time.";
                })()}
              />
            </AnimatePresence>
          </ClientPortal>
        )}
      </div>
    </div>
  );
}
