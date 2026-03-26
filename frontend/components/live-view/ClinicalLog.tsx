import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  ShieldCheck,
  ChevronDown,
  Activity,
  Scale,
  Terminal,
  Square,
  CheckSquare,
  Save,
  Hash,
  AlignLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { behaviorAPI, liveViewAPI } from "@/lib/api";
import type { LiveViewRequestOverview, RequestContextMeta } from "@/lib/api/live-view";
import { getRateLimitInfo, isRateLimitError } from "@/lib/api/client";
import { usePageVisibility } from "@/hooks/usePageVisibility";
import { toEvalRows } from "@/lib/evalRows";
import useSWR from "swr";
import { SnapshotDetailModal } from "@/components/shared/SnapshotDetailModal";
import { useToast } from "@/components/ToastContainer";
import { parsePlanLimitError, type PlanLimitError } from "@/lib/planErrors";
import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import { logger } from "@/lib/logger";

interface EvaluationMetric {
  score: number;
  passed: boolean;
  threshold: number;
}

interface ClinicalSnapshot {
  id: string;
  trace_id?: string;
  agent_id: string;
  provider?: string;
  model: string;
  model_settings?: Record<string, any> | null;
  system_prompt?: string;
  user_message?: string;
  request_prompt: string;
  response?: string;
  response_text: string;
  latency_ms: number;
  tokens_used?: number | null;
  cost?: number | string | null;
  status_code?: number | null;
  is_worst: boolean;
  signal_result?: Record<string, number>;
  evaluation_result: Record<string, EvaluationMetric>;
  payload?: Record<string, any> | null;
  created_at: string;
  has_tool_calls?: boolean;
  /** From list API: payload/trajectory includes tool_result evidence */
  has_tool_results?: boolean;
  tool_calls_summary?: Array<{ name: string; arguments?: string | Record<string, any> }>;
  /** From list API (light mode): server-derived from stored payload markers */
  request_context_meta?: RequestContextMeta | null;
  /** From list API: server-derived request shape summary */
  request_overview?: LiveViewRequestOverview | null;
}

interface ClinicalLogProps {
  projectId: number;
  agentId: string;
  /** Used for Release Gate CTA inside snapshot detail. */
  orgId?: string;
  onLogsMutated?: () => void | Promise<void>;
}

const MIN_LAST_N_RUNS = 10;
const MAX_LAST_N_RUNS = 200;
const MAX_STEP_ROWS = 30;
const DEFAULT_LAST_N_RUNS = 30;
const LOG_LIMIT_OPTIONS = [10, 20, 30, 50, 100, 200] as const;
const CLINICAL_LOG_BASE_POLL_MS = 4000;
const CLINICAL_LOG_MAX_POLL_MS = 30000;

type RiskFilter = "all" | "worst" | "healthy";
const RISK_FILTER_LABELS: Record<RiskFilter, string> = {
  all: "All",
  worst: "Flagged",
  healthy: "Healthy",
};
type SortMode = "newest" | "oldest" | "latency_desc" | "latency_asc";
const SORT_MODE_LABELS: Record<SortMode, string> = {
  newest: "Newest",
  oldest: "Oldest",
  latency_desc: "Latency high",
  latency_asc: "Latency low",
};
type PolicyState = {
  status: "idle" | "loading" | "pass" | "fail" | "error";
  violationCount?: number;
  reportId?: string;
  rulesetHash?: string;
  message?: string;
  ruleSnapshot?: Array<{
    id?: string;
    revision?: string;
    rule_json?: Record<string, any>;
    name?: string;
  }>;
  failedRuleIds?: string[];
};

type EvalCheckSummary = { id: string; enabled: boolean; failed: number; applicable: number };
type EvalPerSnapshot = { snapshot_id: number | string; checks: Record<string, string> };
type EvalResponse = {
  config?: { enabled?: boolean };
  checks?: EvalCheckSummary[];
  per_snapshot?: EvalPerSnapshot[];
};

// Must match AgentEvaluationPanel labels so eval names are consistent (Evaluation tab ↔ Clinical Log / logic).
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

function normalizeEvalConfigKey(key: string): string {
  return key === "tool_use_policy" ? "tool" : key;
}

function isEvalSettingEnabled(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  const enabled = (value as { enabled?: unknown }).enabled;
  if (typeof enabled === "boolean") return enabled;
  return true;
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

function clampRuns(value: number): number {
  if (!Number.isFinite(value)) return MIN_LAST_N_RUNS;
  return Math.max(MIN_LAST_N_RUNS, Math.min(MAX_LAST_N_RUNS, value));
}

function normalizeModelVersion(snapshot: ClinicalSnapshot): string {
  const modelSettingVersion = snapshot.model_settings?.version;
  if (typeof modelSettingVersion === "string" && modelSettingVersion.trim()) {
    return modelSettingVersion;
  }
  const model = String(snapshot.model || "");
  if (model.includes(":")) return model.split(":").pop() || "-";
  if (model.includes("@")) return model.split("@").pop() || "-";
  return "-";
}

function extractCustomCode(snapshot: ClinicalSnapshot): string | null {
  const payload = snapshot.payload || {};
  const maybeCode =
    payload.custom_code ??
    payload.code ??
    payload.script ??
    payload.agent_config?.custom_code ??
    payload.agent_config?.script;
  if (typeof maybeCode === "string" && maybeCode.trim()) return maybeCode.trim();
  if (maybeCode && typeof maybeCode === "object") {
    try {
      return JSON.stringify(maybeCode, null, 2);
    } catch {
      return String(maybeCode);
    }
  }
  return null;
}

function extractStepLogs(
  snapshot: ClinicalSnapshot
): Array<{ name: string; status: string; runtimeMs?: number; detail?: string }> {
  const payload = snapshot.payload || {};
  const candidates = [payload.steps, payload.step_log, payload.trajectory?.steps, payload.events];
  const raw = candidates.find(c => Array.isArray(c));
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_STEP_ROWS).map((step: Record<string, unknown>, idx: number) => {
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
    const runtimeCandidate = step?.runtime_ms ?? step?.duration_ms ?? step?.latency_ms;
    const runtimeMs = Number.isFinite(Number(runtimeCandidate))
      ? Number(runtimeCandidate)
      : undefined;
    const detailValue = step?.detail ?? step?.message ?? step?.output ?? step?.summary;
    const detail =
      typeof detailValue === "string"
        ? detailValue
        : detailValue
          ? JSON.stringify(detailValue)
          : undefined;
    return { name, status, runtimeMs, detail };
  });
}

function extractToolNames(snapshot: ClinicalSnapshot): string[] {
  const summary = snapshot.tool_calls_summary;
  if (Array.isArray(summary) && summary.length > 0) {
    return summary.map(t => t.name).filter(Boolean);
  }
  const payload = snapshot.payload || {};
  const out = new Set<string>();
  const toolCalls = Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
  for (const tc of toolCalls) {
    const name = tc?.name ?? tc?.tool_name ?? tc?.function?.name;
    if (name) out.add(String(name));
  }
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  for (const st of steps) {
    const name = st?.tool_name ?? st?.tool ?? st?.function_name;
    if (name) out.add(String(name));
    const stepType = String(st?.step_type ?? st?.type ?? "").toLowerCase();
    if (stepType.includes("tool") && !name) out.add("tool_call");
  }
  const events = Array.isArray(payload.events) ? payload.events : [];
  for (const ev of events) {
    const name = ev?.tool_name ?? ev?.tool ?? ev?.name;
    if (name) out.add(String(name));
  }
  return Array.from(out);
}

function getRequestOverview(snapshot: ClinicalSnapshot): LiveViewRequestOverview | null {
  const overview = snapshot.request_overview;
  if (!overview || typeof overview !== "object") return null;
  return overview;
}

function getToolDefinitionCount(snapshot: ClinicalSnapshot, toolNames: string[]): number {
  const overview = getRequestOverview(snapshot);
  const serverCount = overview?.tools_count;
  if (typeof serverCount === "number" && Number.isFinite(serverCount) && serverCount >= 0) {
    return serverCount;
  }
  if (toolNames.length > 0) return toolNames.length;
  return snapshot.has_tool_calls ? 1 : 0;
}

function getCaptureStateBadge(snapshot: ClinicalSnapshot): { label: string; title: string } | null {
  const overview = getRequestOverview(snapshot);
  const meta = snapshot.request_context_meta;
  const captureState = String(overview?.capture_state || "").trim().toLowerCase();

  if (captureState === "truncated" || meta?.truncated) {
    const title =
      meta?.request_truncated && meta?.payload_truncated
        ? "Request and payload were both truncated before ingest."
        : meta?.request_truncated
          ? "Request fields were truncated or replaced before ingest."
          : meta?.payload_truncated
            ? "Outer payload was truncated before ingest."
            : "Request context was truncated or replaced before ingest.";
    return { label: "Truncated", title };
  }

  if (captureState === "policy_limited" || meta?.omitted_by_policy) {
    const title =
      meta?.request_text_omitted && meta?.response_text_omitted
        ? "Request and response text were omitted before ingest by privacy settings."
        : meta?.request_text_omitted
          ? "Request text was omitted before ingest by privacy settings."
          : meta?.response_text_omitted
            ? "Response text was omitted before ingest by privacy settings."
            : "Some message or response bodies were omitted before ingest.";
    return { label: "Privacy", title };
  }

  return null;
}

function getRequestShapeBadges(snapshot: ClinicalSnapshot): Array<{ label: string; title: string }> {
  const overview = getRequestOverview(snapshot);
  if (!overview) return [];

  const extendedCount = Array.isArray(overview.extended_context_keys)
    ? overview.extended_context_keys.length
    : 0;
  const additionalCount = Array.isArray(overview.additional_request_keys)
    ? overview.additional_request_keys.length
    : 0;
  const controlCount = Array.isArray(overview.request_control_keys)
    ? overview.request_control_keys.length
    : 0;

  const badges: Array<{ label: string; title: string }> = [];

  if (extendedCount > 0) {
    badges.push({
      label: "Context",
      title: `${extendedCount} extended context field${extendedCount === 1 ? "" : "s"} captured on this request.`,
    });
  }

  if (additionalCount > 0 || controlCount > 0) {
    const fieldCount = additionalCount + controlCount;
    badges.push({
      label: "Fields",
      title: `${fieldCount} replay-relevant field${fieldCount === 1 ? "" : "s"} outside the main message list.`,
    });
  }

  return badges;
}

/** Build "actual vs config" line for an eval check from snapshot + saved eval config. */
function getEvalDetail(
  s: ClinicalSnapshot,
  checkId: string,
  savedEvalConfig: Record<string, any>
): { actualStr: string; configStr: string } {
  const toFiniteNumber = (value: unknown, fallback: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const cfg = (savedEvalConfig[checkId] || {}) as Record<string, any>;
  const res = (s.response_text || s.response || "").trim();
  const len = res.length;
  let actualStr = "—";
  let configStr = "—";
  switch (checkId) {
    case "empty": {
      const minChars = toFiniteNumber(cfg?.min_chars, 16);
      configStr = `min ${minChars} chars`;
      return { actualStr: `${len} chars`, configStr };
    }
    case "latency": {
      const failMs = toFiniteNumber(cfg?.fail_ms ?? cfg?.crit_ms ?? cfg?.warn_ms, 5000);
      configStr = `fail ≥ ${failMs}ms`;
      const ms = s.latency_ms ?? 0;
      return { actualStr: `${ms}ms`, configStr };
    }
    case "status_code": {
      const failFrom = toFiniteNumber(cfg?.fail_from ?? cfg?.crit_from ?? cfg?.warn_from, 500);
      configStr = `fail ≥ ${failFrom}`;
      const code = s.status_code ?? 200;
      return { actualStr: String(code), configStr };
    }
    case "length": {
      const failR = toFiniteNumber(cfg?.fail_ratio ?? cfg?.crit_ratio ?? cfg?.warn_ratio, 0.75);
      configStr = `fail ±${Math.round(failR * 100)}% vs baseline`;
      actualStr = `${len} chars (vs baseline window)`;
      return { actualStr, configStr };
    }
    case "repetition": {
      const failR = toFiniteNumber(
        cfg?.fail_line_repeats ?? cfg?.crit_line_repeats ?? cfg?.warn_line_repeats,
        6
      );
      configStr = `fail ≥ ${failR} repeats`;
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
      return { actualStr: maxRep ? `${maxRep} max repeats` : "—", configStr };
    }
    case "json":
      configStr = (cfg?.mode || "if_json") === "if_json" ? "if_json" : "always";
      return { actualStr, configStr };
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

export const ClinicalLog: React.FC<ClinicalLogProps> = ({
  projectId,
  agentId,
  orgId,
  onLogsMutated,
}) => {
  const toast = useToast();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [recentTraceLimit, setRecentTraceLimit] = React.useState<number>(DEFAULT_LAST_N_RUNS);
  const [riskFilter, setRiskFilter] = React.useState<RiskFilter>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("newest");
  const [policyByTrace, setPolicyByTrace] = React.useState<Record<string, PolicyState>>({});
  const [isSelectMode, setIsSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isRemoveMode, setIsRemoveMode] = React.useState(false);
  const [selectedRemoveIds, setSelectedRemoveIds] = React.useState<Set<string>>(new Set());
  const [isDeletingSnapshots, setIsDeletingSnapshots] = React.useState(false);
  const [isSavingToDatasets, setIsSavingToDatasets] = React.useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = React.useState(false);
  const [snapshotIdsToSave, setSnapshotIdsToSave] = React.useState<number[]>([]);
  const [selectedDatasetIdsForSave, setSelectedDatasetIdsForSave] = React.useState<Set<string>>(
    new Set()
  );
  const [newDatasetName, setNewDatasetName] = React.useState("");
  const [pollIntervalMs, setPollIntervalMs] = React.useState(CLINICAL_LOG_BASE_POLL_MS);
  const [planError, setPlanError] = React.useState<PlanLimitError | null>(null);
  const isPageVisible = usePageVisibility();
  const wasPageVisibleRef = React.useRef(isPageVisible);

  // Keep log selection strictly scoped to the current node.
  React.useEffect(() => {
    setSelectedIds(new Set());
    setSelectedRemoveIds(new Set());
    setIsSelectMode(false);
    setIsRemoveMode(false);
  }, [projectId, agentId]);

  const { data: settingsData, mutate: mutateSettings } = useSWR(
    projectId && agentId ? ["agent-log-settings", projectId, agentId] : null,
    () => liveViewAPI.getAgentSettings(projectId, agentId),
    { revalidateOnFocus: false }
  );

  React.useEffect(() => {
    const persisted = Number(settingsData?.diagnostic_config?.eval?.window?.limit);
    if (Number.isFinite(persisted)) {
      const clamped = clampRuns(persisted);
      setRecentTraceLimit(clamped);
    }
  }, [settingsData]);

  const { data, error, isLoading, mutate } = useSWR(
    projectId && agentId ? ["agent-snapshots", projectId, agentId, recentTraceLimit] : null,
    () =>
      liveViewAPI.listSnapshots(projectId, {
        agent_id: agentId,
        limit: recentTraceLimit,
        light: true,
      }),
    {
      keepPreviousData: true,
      refreshInterval: isPageVisible ? pollIntervalMs : 0,
      revalidateOnFocus: false,
      refreshWhenHidden: false,
      shouldRetryOnError: false,
    }
  );

  const rateLimitInfo = getRateLimitInfo(error);
  const isRateLimited = isRateLimitError(error);

  React.useEffect(() => {
    if (!error) {
      setPlanError(null);
      return;
    }
    const parsed = parsePlanLimitError(error);
    if (parsed && parsed.code === "SNAPSHOT_PLAN_LIMIT_REACHED") {
      setPlanError(parsed);
    } else {
      setPlanError(null);
    }
  }, [error]);

  React.useEffect(() => {
    if (!projectId || !agentId) return;
    if (!error) {
      setPollIntervalMs(CLINICAL_LOG_BASE_POLL_MS);
      return;
    }

    if (isRateLimited) {
      const retryAfterMs = Math.max(
        CLINICAL_LOG_BASE_POLL_MS,
        (rateLimitInfo.retryAfterSec || 0) * 1000
      );
      setPollIntervalMs(Math.min(retryAfterMs, CLINICAL_LOG_MAX_POLL_MS));
      return;
    }

    setPollIntervalMs(current => Math.min(current * 2, CLINICAL_LOG_MAX_POLL_MS));
  }, [agentId, error, isRateLimited, projectId, rateLimitInfo.retryAfterSec]);

  React.useEffect(() => {
    if (!projectId || !agentId) return;
    const becameVisible = !wasPageVisibleRef.current && isPageVisible;
    wasPageVisibleRef.current = isPageVisible;
    if (!becameVisible) return;
    void mutate();
  }, [agentId, isPageVisible, mutate, projectId]);

  const saveRecentTraceLimit = async (nextLimit: number) => {
    if (!projectId || !agentId) return;
    const limit = clampRuns(nextLimit);
    setRecentTraceLimit(limit);
    try {
      const existingEval = (settingsData?.diagnostic_config?.eval || {}) as Record<string, unknown>;
      await liveViewAPI.updateAgentSettings(projectId, agentId, {
        diagnostic_config: {
          eval: {
            ...existingEval,
            window: { limit },
          },
        },
      });
      await mutateSettings();
    } finally {
      // Keep UI responsive; no extra local draft state to reset.
    }
  };

  const snapshots = (data?.items || []) as ClinicalSnapshot[];

  React.useEffect(() => {
    // Collapse expanded card when filters/window change to avoid stale selection confusion.
    setExpandedId(null);
  }, [riskFilter, recentTraceLimit, agentId]);

  const activeSnapshots = React.useMemo(() => snapshots, [snapshots]);
  const totalSnapshotsCount = Number(data?.total_count ?? data?.count ?? snapshots.length);

  // List uses light mode (no payload/long text); detail modal always needs full snapshot. Cache by (projectId, snapshotId).
  const snapshotDetailCacheRef = React.useRef<Map<string, ClinicalSnapshot>>(new Map());
  const [detailFetchedSnapshot, setDetailFetchedSnapshot] = React.useState<ClinicalSnapshot | null>(
    null
  );
  React.useEffect(() => {
    if (!expandedId || !projectId) {
      setDetailFetchedSnapshot(null);
      return;
    }
    const cacheKey = `${projectId}-${expandedId}`;
    const cached = snapshotDetailCacheRef.current.get(cacheKey);
    if (cached) {
      setDetailFetchedSnapshot(cached);
      return;
    }
    const s = snapshots.find(snap => String(snap.id) === String(expandedId));
    setDetailFetchedSnapshot(null);
    liveViewAPI
      .getSnapshot(projectId, expandedId)
      .then((full: Record<string, unknown>) => {
        if (!full || String(full.id) !== String(expandedId)) return;
        const merged = (s ? ({ ...s, ...full } as unknown) : (full as unknown)) as ClinicalSnapshot;
        snapshotDetailCacheRef.current.set(cacheKey, merged);
        setDetailFetchedSnapshot(merged);
      })
      .catch(() => {});
  }, [expandedId, projectId, snapshots]);

  const { data: evalData } = useSWR(
    projectId && agentId ? ["agent-eval-runtime", projectId, agentId, recentTraceLimit] : null,
    () => liveViewAPI.getAgentEvaluation(projectId, agentId),
    { revalidateOnFocus: false }
  );
  const { data: projectRulesData } = useSWR(
    projectId ? ["policy-rules-project", projectId] : null,
    () => behaviorAPI.listRules(projectId, { enabled: true, scope_type: "project" })
  );
  const { data: agentRulesData } = useSWR(
    projectId && agentId ? ["policy-rules-agent", projectId, agentId] : null,
    () =>
      behaviorAPI.listRules(projectId, { enabled: true, scope_type: "agent", scope_ref: agentId })
  );
  const { data: reportsData } = useSWR(
    projectId && agentId ? ["behavior-reports-agent", projectId, agentId, "clinical-log"] : null,
    () => behaviorAPI.listReports(projectId, { agent_id: agentId, limit: 200, offset: 0 })
  );

  const evalRuntime = React.useMemo(() => (evalData || {}) as EvalResponse, [evalData]);
  const savedEvalConfig = (settingsData?.diagnostic_config?.eval || {}) as Record<string, any>;
  const runtimeEnabledCheckIds = React.useMemo(() => {
    const checks = Array.isArray(evalRuntime?.checks) ? evalRuntime.checks : [];
    const enabled = checks
      .filter((c: EvalCheckSummary) => c.enabled)
      .map((c: EvalCheckSummary) => c.id);
    if (enabled.length > 0) return enabled;
    const fromSaved = Object.entries(savedEvalConfig)
      .filter(([key, value]) => {
        const normalized = normalizeEvalConfigKey(key);
        if (!(normalized in EVAL_CHECK_LABELS)) return false;
        return isEvalSettingEnabled(value);
      })
      .map(([key]) => normalizeEvalConfigKey(key));
    if (fromSaved.length > 0) return Array.from(new Set(fromSaved));
    return [];
  }, [evalRuntime?.checks, savedEvalConfig]);
  const enabledEvalChecks = React.useMemo<EvalCheckSummary[]>(
    () => runtimeEnabledCheckIds.map(id => ({ id, enabled: true, failed: 0, applicable: 0 })),
    [runtimeEnabledCheckIds]
  );
  // Use stored eval_checks_result only (single source of truth; matches DATA tab detail).
  const hasAnyEvalContext = React.useMemo(
    () => activeSnapshots.some(s => toEvalRows(s as unknown as Record<string, unknown>).length > 0),
    [activeSnapshots]
  );
  const evalEnabled = hasAnyEvalContext || enabledEvalChecks.length > 0;
  const getSnapshotEvalRows = React.useCallback((snapshot: ClinicalSnapshot) => {
    return toEvalRows(snapshot as unknown as Record<string, unknown>);
  }, []);
  const getSnapshotFailedCount = React.useCallback(
    (snapshot: ClinicalSnapshot) => {
      const rows = getSnapshotEvalRows(snapshot);
      return rows.reduce((acc, row) => {
        const st = row.status;
        // Evaluation rules:
        // - "fail"     → counts as failure
        // - "pass"     → counts as success
        // - anything else (e.g. "not_applicable", "skipped") is treated as neutral
        return st === "fail" ? acc + 1 : acc;
      }, 0);
    },
    [getSnapshotEvalRows]
  );
  const filteredSnapshots = React.useMemo(() => {
    const hasEvalContext = hasAnyEvalContext;
    const isEvalFlagged = (s: ClinicalSnapshot) => getSnapshotFailedCount(s) > 0;

    if (riskFilter === "all") return activeSnapshots;
    if (riskFilter === "worst") {
      // FLAGGED: prefer eval-based failure signal; fallback to backend critical flag.
      return activeSnapshots.filter(s => (hasEvalContext ? isEvalFlagged(s) : Boolean(s.is_worst)));
    }
    // HEALTHY: no eval failures (or no backend critical flag when eval context is unavailable)
    return activeSnapshots.filter(s => (hasEvalContext ? !isEvalFlagged(s) : !s.is_worst));
  }, [activeSnapshots, riskFilter, hasAnyEvalContext, getSnapshotFailedCount]);
  const visibleSnapshots = React.useMemo(() => {
    const out = [...filteredSnapshots];
    if (sortMode === "oldest") {
      out.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return out;
    }
    if (sortMode === "latency_desc") {
      out.sort((a, b) => Number(b.latency_ms || 0) - Number(a.latency_ms || 0));
      return out;
    }
    if (sortMode === "latency_asc") {
      out.sort((a, b) => Number(a.latency_ms || 0) - Number(b.latency_ms || 0));
      return out;
    }
    out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return out;
  }, [filteredSnapshots, sortMode]);

  React.useEffect(() => {
    if (expandedId && !visibleSnapshots.some(s => String(s.id) === String(expandedId))) {
      setExpandedId(null);
    }
  }, [expandedId, visibleSnapshots]);

  const configuredPolicies = React.useMemo(() => {
    const projectRules = Array.isArray(projectRulesData) ? projectRulesData : [];
    const agentRules = Array.isArray(agentRulesData) ? agentRulesData : [];
    const merged = [...agentRules, ...projectRules];
    const seen = new Set<string>();
    return merged.filter((r: { id?: unknown }) => {
      const id = String(r?.id || "");
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [projectRulesData, agentRulesData]);
  const configuredPolicyMap = React.useMemo(() => {
    const map = new Map<string, unknown>();
    for (const rule of configuredPolicies) {
      map.set(String((rule as { id?: unknown })?.id || ""), rule);
    }
    return map;
  }, [configuredPolicies]);
  React.useEffect(() => {
    const reportItems = Array.isArray((reportsData as { items?: unknown[] })?.items)
      ? (reportsData as { items: unknown[] }).items
      : [];
    if (reportItems.length === 0) return;
    const reports = reportItems as Array<Record<string, unknown>>;
    setPolicyByTrace(prev => {
      const next = { ...prev };
      for (const report of reports) {
        const traceId = String(report?.trace_id ?? "").trim();
        if (!traceId || next[traceId]) continue;
        const status = String(report?.status ?? "").toLowerCase();
        if (status !== "pass" && status !== "fail") continue;
        const summary = report?.summary as Record<string, unknown> | undefined;
        const violations = Array.isArray(report?.violations) ? report.violations : [];
        const failedRuleIds = Array.from(
          new Set<string>(
            violations.map((v: { rule_id?: unknown }) => String(v?.rule_id || "")).filter(Boolean)
          )
        );
        next[traceId] = {
          status: status as "pass" | "fail",
          violationCount: Number(summary?.violation_count ?? violations.length ?? 0),
          reportId: String(report?.id ?? ""),
          rulesetHash: String(summary?.ruleset_hash ?? report?.ruleset_hash ?? ""),
          ruleSnapshot: Array.isArray(summary?.rule_snapshot) ? summary.rule_snapshot : undefined,
          message:
            status === "pass" ? "No policy violations." : "Policy violations flagged.",
          failedRuleIds,
        };
      }
      return next;
    });
  }, [reportsData]);

  const toggleSelect = (snapshotId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(snapshotId)) next.delete(snapshotId);
      else next.add(snapshotId);
      return next;
    });
  };

  const toggleRemoveSelect = (snapshotId: string) => {
    setSelectedRemoveIds(prev => {
      const next = new Set(prev);
      if (next.has(snapshotId)) next.delete(snapshotId);
      else next.add(snapshotId);
      return next;
    });
  };

  const selectAllForRemove = () => {
    if (selectedRemoveIds.size === visibleSnapshots.length) {
      setSelectedRemoveIds(new Set());
    } else {
      setSelectedRemoveIds(new Set(visibleSnapshots.map(s => String(s.id))));
    }
  };

  const deleteSelectedSnapshots = async () => {
    if (selectedRemoveIds.size === 0) return;
    const targetIds = Array.from(selectedRemoveIds)
      .map(id => Number(id))
      .filter(id => Number.isFinite(id));
    if (targetIds.length === 0) return;
    setIsDeletingSnapshots(true);
    try {
      const result = await liveViewAPI.deleteSnapshotsBatch(projectId, targetIds);
      const deletedCount = Number(result?.deleted ?? 0);
      toast.showToast(
        deletedCount > 0
          ? `Deleted ${deletedCount} log${deletedCount === 1 ? "" : "s"} from project history.`
          : "No logs were deleted.",
        deletedCount > 0 ? "success" : "info"
      );
      setSelectedRemoveIds(new Set());
      setIsRemoveMode(false);
      if (expandedId && targetIds.includes(Number(expandedId))) {
        setExpandedId(null);
      }
      await mutate();
      await Promise.resolve(onLogsMutated?.()).catch(() => undefined);
    } catch (error) {
      logger.error("Failed to delete snapshots", error);
      toast.showToast("Failed to delete selected logs. Please try again.", "error");
    } finally {
      setIsDeletingSnapshots(false);
    }
  };

  const selectAll = () => {
    if (selectedIds.size === visibleSnapshots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleSnapshots.map(s => String(s.id))));
    }
  };

  const { data: datasetsData, mutate: mutateDatasets } = useSWR(
    projectId && agentId ? ["behavior-datasets", projectId, agentId] : null,
    () => behaviorAPI.listDatasets(projectId, { agent_id: agentId, limit: 200, offset: 0 }),
    { keepPreviousData: true }
  );
  const datasetsForSave = React.useMemo(
    () =>
      Array.isArray((datasetsData as { items?: unknown[] } | undefined)?.items)
        ? ((datasetsData as { items: any[] }).items as Array<{
            id: string;
            label?: string | null;
            snapshot_count?: number | null;
            created_at?: string | null;
          }>)
        : [],
    [datasetsData]
  );

  const openSaveToDatasetsModal = () => {
    if (!projectId || !agentId) return;
    const visibleById = new Set(visibleSnapshots.map(s => String(s.id)));
    const selectedSnapshotIds = Array.from(selectedIds)
      .filter(id => visibleById.has(String(id)))
      .map(Number)
      .filter(Number.isFinite);
    if (selectedSnapshotIds.length === 0) {
      toast.showToast("No logs selected.", "warning");
      return;
    }
    setSnapshotIdsToSave(selectedSnapshotIds);
    setSelectedDatasetIdsForSave(new Set());
    setNewDatasetName("");
    setIsSaveModalOpen(true);
  };

  const closeSaveModal = () => {
    if (isSavingToDatasets) return;
    setIsSaveModalOpen(false);
  };

  const saveSelectionToDatasets = async () => {
    if (!projectId || !agentId) return;
    if (snapshotIdsToSave.length === 0) {
      toast.showToast("No logs selected to save.", "warning");
      return;
    }
    const targetDatasetIds = Array.from(selectedDatasetIdsForSave);
    const trimmedName = newDatasetName.trim();
    if (targetDatasetIds.length === 0 && !trimmedName) {
      toast.showToast("Select at least one dataset or enter a new name.", "warning");
      return;
    }

    setIsSavingToDatasets(true);
    try {
      const evalConfig = savedEvalConfig as Record<string, unknown>;
      const ruleSnapshot = configuredPolicies
        .map((r: { id?: unknown; updated_at?: unknown; rule_json?: unknown }) => ({
          id: String(r.id ?? ""),
          revision: r.updated_at != null ? String(r.updated_at) : undefined,
          rule_json: (r.rule_json as Record<string, unknown>) || {},
        }))
        .filter(r => r.id);

      let createdDatasetName: string | null = null;
      if (trimmedName) {
        const body = {
          snapshot_ids: snapshotIdsToSave,
          agent_id: agentId,
          label: trimmedName,
          eval_config_snapshot: Object.keys(evalConfig).length ? evalConfig : undefined,
          policy_ruleset_snapshot: ruleSnapshot.length ? ruleSnapshot : undefined,
        };
        await behaviorAPI.createDataset(projectId, body);
        createdDatasetName = trimmedName;
      }

      let totalAdded = 0;
      let totalAlready = 0;
      for (const datasetId of targetDatasetIds) {
        const detail = await behaviorAPI.getDataset(projectId, datasetId);
        const existingSnapshotIds = Array.isArray(detail?.snapshot_ids)
          ? detail.snapshot_ids.map(Number).filter(Number.isFinite)
          : [];
        const merged = Array.from(new Set([...existingSnapshotIds, ...snapshotIdsToSave]));
        const added = Math.max(0, merged.length - existingSnapshotIds.length);
        if (added > 0) {
          await behaviorAPI.updateDataset(projectId, datasetId, { snapshot_ids: merged });
          totalAdded += added;
        } else {
          totalAlready += snapshotIdsToSave.length;
        }
      }

      await mutateDatasets();

      if (trimmedName && targetDatasetIds.length === 0) {
        const count = snapshotIdsToSave.length;
        toast.showToast(
          `Saved ${count} log${count !== 1 ? "s" : ""} to new dataset "${trimmedName}".`,
          "success"
        );
      } else {
        const parts: string[] = [];
        if (totalAdded > 0) parts.push(`added ${totalAdded}`);
        if (totalAlready > 0) parts.push(`already in target datasets`);
        if (createdDatasetName) parts.push(`created "${createdDatasetName}"`);
        const summary = parts.length > 0 ? parts.join(", ") : "no changes";
        toast.showToast(
          `Saved ${snapshotIdsToSave.length} log${snapshotIdsToSave.length !== 1 ? "s" : ""} to datasets: ${summary}.`,
          totalAdded > 0 || createdDatasetName ? "success" : "warning"
        );
      }

      setSelectedIds(new Set());
      setIsSelectMode(false);
      setIsSaveModalOpen(false);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to save logs to datasets";
      toast.showToast(typeof msg === "string" ? msg : "Failed to save logs to datasets", "error");
    } finally {
      setIsSavingToDatasets(false);
    }
  };

  if (isLoading) {
    return (
      <div
        className="flex flex-col h-full bg-[#111216]"
        role="status"
        aria-label="Loading clinical log"
      >
        <div className="p-5 flex items-center justify-between gap-4 border-b border-white/[0.04] bg-[#18191e]">
          <div className="animate-pulse h-5 w-24 rounded bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="animate-pulse h-8 w-32 rounded-lg bg-white/10" />
            <div className="animate-pulse h-8 w-20 rounded-xl bg-white/10" />
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map(i => (
            <div
              key={i}
              className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="animate-pulse h-4 w-40 rounded bg-white/10" />
                <div className="animate-pulse h-4 w-20 rounded bg-white/10" />
              </div>
              <div className="animate-pulse h-3 w-full max-w-md rounded bg-white/5" />
              <div className="flex gap-2">
                <div className="animate-pulse h-5 w-16 rounded bg-white/5" />
                <div className="animate-pulse h-5 w-14 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
        <span className="sr-only">Decoding neural logs...</span>
      </div>
    );
  }

  const isEmptyResult = visibleSnapshots.length === 0;

  const mainContent = (
    <div className="flex h-0 flex-1 min-h-0 flex-col overflow-hidden bg-[#111216]">
      {/* Log Header Summary */}
      <div className="p-5 flex items-center justify-between gap-4 border-b border-white/[0.04] bg-[#18191e]">
        <div className="flex items-center">
          <span className="px-2 py-0.5 rounded-md text-[13px] font-mono text-slate-400 capitalize tracking-wide">
            Showing {visibleSnapshots.length} of {totalSnapshotsCount} logs
            {totalSnapshotsCount > recentTraceLimit ? ` · cap ${recentTraceLimit}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          {/* Risk Filter - Pill Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-[#030806] border border-white/[0.04] shadow-inner">
            {(["all", "worst", "healthy"] as RiskFilter[]).map(mode => (
              <button
                key={mode}
                onClick={() => setRiskFilter(mode)}
                title={
                  mode === "worst"
                    ? "Flagged: Issues detected"
                    : mode === "healthy"
                      ? "Healthy: No issues"
                      : "All"
                }
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-[12px] font-bold tracking-wide transition-all",
                  riskFilter === mode
                    ? "bg-white/[0.08] text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                )}
              >
                {RISK_FILTER_LABELS[mode]}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-white/10 hidden md:block" />

          {/* Show limit */}
          <div className="bg-[#030806] border border-white/[0.04] rounded-xl hover:border-white/10 transition-colors focus-within:border-emerald-500/50">
            <label className="sr-only" htmlFor="clinical-log-show-limit">
              Show logs limit
            </label>
            <select
              id="clinical-log-show-limit"
              value={recentTraceLimit}
              onChange={e => void saveRecentTraceLimit(Number(e.target.value))}
              className="pl-3 pr-2 py-1.5 bg-transparent text-xs font-bold tracking-[0.08em] text-slate-300 outline-none cursor-pointer"
              title={`Show logs limit (${MIN_LAST_N_RUNS} to ${MAX_LAST_N_RUNS})`}
            >
              {LOG_LIMIT_OPTIONS.map(limit => (
                <option key={limit} value={limit} className="bg-[#18191e] text-slate-200">
                  {`Show ${limit}`}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="bg-[#030806] border border-white/[0.04] rounded-xl hover:border-white/10 transition-colors focus-within:border-emerald-500/50">
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="pl-3 pr-2 py-1.5 bg-transparent text-xs font-bold tracking-[0.08em] text-slate-300 outline-none cursor-pointer"
            >
              {(Object.keys(SORT_MODE_LABELS) as SortMode[]).map(mode => (
                <option key={mode} value={mode} className="bg-[#18191e] text-slate-200">
                  {SORT_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>

          <div className="w-px h-4 bg-white/10 hidden md:block" />

          {/* Save selection to datasets (playlist-style) */}
          <button
            onClick={() => {
              setIsSelectMode(m => !m);
              setIsRemoveMode(false);
              setSelectedRemoveIds(new Set());
              if (isSelectMode) setSelectedIds(new Set());
            }}
            className={clsx(
              "px-4 py-1.5 rounded-xl border text-[12px] font-bold uppercase tracking-wide transition-all flex items-center gap-2",
              isSelectMode
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                : "bg-[#030806] border-white/[0.04] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]"
            )}
          >
            {isSelectMode ? <XCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {isSelectMode ? "Cancel" : "Save"}
          </button>

          {isSelectMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1.5 rounded-xl bg-[#030806] border border-white/[0.04] text-[12px] font-bold tracking-[0.08em] text-slate-300 hover:bg-white/[0.05]"
              >
                {selectedIds.size === visibleSnapshots.length ? "Deselect" : "Select all"}
              </button>
              <button
                onClick={openSaveToDatasetsModal}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-[12px] font-bold tracking-[0.08em] text-emerald-300 hover:bg-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingToDatasets ? "Saving..." : `Save (${selectedIds.size})`}
              </button>
            </div>
          )}

          {/* Delete from project history */}
          <button
            onClick={() => {
              setIsRemoveMode(m => !m);
              setIsSelectMode(false);
              setSelectedIds(new Set());
              if (!isRemoveMode) {
                setSelectedRemoveIds(new Set());
              }
            }}
            className={clsx(
              "px-4 py-1.5 rounded-xl border text-[12px] font-bold uppercase tracking-wide transition-all flex items-center gap-2",
              isRemoveMode
                ? "bg-rose-500/20 border-rose-500/30 text-rose-300"
                : "bg-[#030806] border-white/[0.04] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]"
            )}
          >
            {isRemoveMode ? <XCircle className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isRemoveMode ? "Cancel" : "Delete"}
          </button>

          {isRemoveMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllForRemove}
                className="px-3 py-1.5 rounded-xl bg-[#030806] border border-white/[0.04] text-[12px] font-bold tracking-[0.08em] text-slate-300 hover:bg-white/[0.05]"
              >
                {selectedRemoveIds.size === visibleSnapshots.length ? "Deselect" : "Select all"}
              </button>
              <button
                onClick={() => void deleteSelectedSnapshots()}
                disabled={selectedRemoveIds.size === 0 || isDeletingSnapshots}
                className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-[12px] font-bold tracking-[0.08em] text-rose-300 hover:bg-rose-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingSnapshots
                  ? "Deleting..."
                  : selectedRemoveIds.size === 0
                    ? "Delete"
                    : `Delete (${selectedRemoveIds.size})`}
              </button>
            </div>
          )}
        </div>
      </div>
      {planError && (
        <div className="mx-4 mb-3">
          <PlanLimitBanner {...planError} context="snapshots" />
        </div>
      )}
      {error && !planError && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3">
          <span className="text-xs text-rose-300 font-medium">
            {isRateLimited
              ? `Live updates are temporarily throttled. Please wait${rateLimitInfo.retryAfterSec ? ` about ${rateLimitInfo.retryAfterSec} seconds` : " a moment"} and retry.`
              : "Failed to load snapshots. Please retry."}
          </span>
          <button
            type="button"
            onClick={() => mutate()}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-white/20 bg-white/5 text-slate-300 text-xs font-medium hover:bg-white/10 transition-colors"
            aria-label="Retry loading snapshots"
          >
            Retry
          </button>
        </div>
      )}

      {/* Scrollable Data Grid */}
      <div
        className="relative h-0 flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-4 md:p-6 lg:p-8"
        onWheelCapture={event => {
          event.stopPropagation();
        }}
      >
        <div className="flex shrink-0 flex-col border border-white/[0.06] rounded-[20px] overflow-hidden bg-[#18191e] shadow-2xl mb-12">
          {/* Fixed Data Grid Header */}
          <div className="bg-[#18191e] flex items-center justify-between text-[13px] font-bold text-slate-400 border-b border-white/[0.06] py-3.5 px-6 shrink-0">
            <div className="flex items-center gap-4 flex-1 pr-4">
              {isSelectMode ? (
                <div className="w-8 shrink-0 text-center">SEL</div>
              ) : isRemoveMode ? (
                <div className="w-8 shrink-0 text-center">DEL</div>
              ) : (
                <div className="w-[4.5rem] shrink-0 pl-1 capitalize">time</div>
              )}

              <div className="w-px h-3 bg-transparent hidden md:block shrink-0 mx-1" />

              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-24 shrink-0 capitalize">model</div>
                {evalEnabled && (
                  <div className="w-14 shrink-0 flex justify-center capitalize">eval</div>
                )}
                <div className="flex-1 ml-2 capitalize">prompt / user input</div>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0 pr-2">
              <div className="w-16 shrink-0 text-right capitalize">latency</div>
              <div className="w-6 shrink-0" />
            </div>
          </div>

          {isEmptyResult ? (
            <div className="p-10 text-center space-y-4 m-6 border border-dashed border-white/5 rounded-3xl">
              <Terminal className="w-8 h-8 text-slate-700 mx-auto" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide leading-relaxed">
                {riskFilter === "all"
                  ? "No logs yet for this agent. Run the agent and this panel will auto-refresh every few seconds."
                  : `No logs match ${RISK_FILTER_LABELS[riskFilter]} filter. Try All or raise Show limit.`}
              </p>
              {riskFilter !== "all" && (
                <button
                  onClick={() => setRiskFilter("all")}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs font-bold uppercase tracking-wide text-slate-200 hover:bg-white/[0.06]"
                >
                  Show all
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleSnapshots.map(s => {
                const isExpanded = expandedId === s.id;
                const date = new Date(s.created_at);
                const timeStr = date.toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
                const timeMain = timeStr.split(" ")[0] || timeStr;
                const timeAmPm = timeStr.split(" ")[1] || "";
                const fullTime = formatPrettyTime(s.created_at);
                const stepLogs = extractStepLogs(s);
                const toolNames = extractToolNames(s);
                const toolDefinitionCount = getToolDefinitionCount(s, toolNames);
                const hasPolicyContext = toolDefinitionCount > 0;
                const captureStateBadge = getCaptureStateBadge(s);
                const requestShapeBadges = getRequestShapeBadges(s);
                const customCode = extractCustomCode(s);
                const traceKey = String(s.trace_id || "");
                const policyState = policyByTrace[traceKey] ||
                  policyByTrace[String(s.id)] || { status: "idle" as const };
                const evalRows = getSnapshotEvalRows(s);
                const snapshotRules = Array.isArray(policyState.ruleSnapshot)
                  ? policyState.ruleSnapshot
                  : [];
                const policyRulesForRun =
                  snapshotRules.length > 0
                    ? snapshotRules.map((snapRule: Record<string, unknown>) => {
                        const ruleId = String(snapRule?.id || "");
                        const currentRule = configuredPolicyMap.get(ruleId) as
                          | Record<string, unknown>
                          | undefined;
                        return {
                          id: ruleId || `snapshot-${String(s.id)}`,
                          name: String(
                            snapRule?.name ?? currentRule?.name ?? `Rule ${ruleId || "snapshot"}`
                          ),
                          scope_type: (currentRule?.scope_type as string) || "snapshot",
                          scope_ref: (currentRule?.scope_ref as string) ?? "",
                          rule_json:
                            (snapRule?.rule_json as object) ??
                            (currentRule?.rule_json as object) ??
                            {},
                        };
                      })
                    : configuredPolicies;
                const canEvaluatePolicy =
                  Boolean(s.trace_id) && configuredPolicies.length > 0 && hasPolicyContext;

                // Simple analysis
                const failedCount = getSnapshotFailedCount(s);
                const isHealthy = failedCount === 0;
                const passedCount = evalRows.filter(r => r.status === "pass").length;
                const successLike =
                  !s.is_worst &&
                  (s.status_code == null || (s.status_code >= 200 && s.status_code < 400));

                return (
                  <div
                    key={s.id}
                    className={clsx(
                      "group transition-colors duration-200 overflow-hidden border-b border-white/[0.04]",
                      isExpanded
                        ? clsx(
                            "bg-white/[0.02]",
                            failedCount > 0
                              ? "border-l-[2px] border-l-rose-500/40"
                              : passedCount > 0
                                ? "border-l-[2px] border-l-emerald-500/40"
                                : "border-l-[2px] border-l-emerald-500/20"
                          )
                        : clsx(
                            "border-l-[2px] border-l-transparent",
                            failedCount > 0
                              ? "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
                              : passedCount > 0
                                ? "bg-emerald-500/[0.02] hover:bg-emerald-500/[0.04]"
                                : "bg-transparent hover:bg-white/[0.02]"
                          )
                    )}
                  >
                    {/* Summary Line */}
                    <div
                      onClick={() => {
                        if (isSelectMode) {
                          toggleSelect(String(s.id));
                        } else if (isRemoveMode) {
                          toggleRemoveSelect(String(s.id));
                        } else {
                          setExpandedId(isExpanded ? null : s.id);
                        }
                      }}
                      className="py-3 px-6 flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-4 min-w-0 flex-1 pr-4">
                        {isSelectMode ? (
                          <div className="flex flex-col items-center justify-center w-8 shrink-0">
                            {selectedIds.has(String(s.id)) ? (
                              <CheckSquare className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                            )}
                          </div>
                        ) : isRemoveMode ? (
                          <div className="flex flex-col items-center justify-center w-8 shrink-0">
                            {selectedRemoveIds.has(String(s.id)) ? (
                              <CheckSquare className="w-4 h-4 text-rose-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-600 group-hover:text-rose-400 transition-colors" />
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0 w-[4.5rem]">
                            <div
                              className={clsx(
                                "w-1.5 h-1.5 rounded-full shrink-0",
                                failedCount > 0
                                  ? "bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                                  : passedCount > 0
                                    ? "bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                                    : "bg-slate-600/50"
                              )}
                            />
                            <div className="flex items-baseline gap-1" title={fullTime}>
                              <span className="text-[13px] font-medium text-slate-300 font-mono tracking-widest">
                                {timeMain}
                              </span>
                              <span className="text-[11px] font-bold text-slate-500 uppercase">
                                {timeAmPm}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="w-px h-3 bg-white/5 hidden md:block shrink-0 mx-1" />

                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-[14px] font-medium text-slate-200 truncate shrink-0 w-24">
                            {s.model.split("/")[1] || s.model}
                          </span>

                          {evalEnabled && evalRows.length > 0 && (
                            <div
                              className={clsx(
                                "shrink-0 px-2.5 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-widest flex items-center",
                                failedCount > 0
                                  ? "border-rose-500/20 bg-rose-500/10 text-rose-500/90"
                                  : "border-emerald-500/20 bg-emerald-500/10 text-emerald-500/90"
                              )}
                            >
                              EVAL: {failedCount > 0 ? "FLAGGED" : "HEALTHY"}
                            </div>
                          )}
                          {toolDefinitionCount > 0 && (
                            <div
                              className="shrink-0 px-2.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400/90 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1"
                              title={
                                toolNames.length > 0
                                  ? `Tools: ${toolNames.join(", ")}`
                                  : `${toolDefinitionCount} tool definition${toolDefinitionCount === 1 ? "" : "s"} captured on this request.`
                              }
                            >
                              Tool{toolDefinitionCount !== 1 ? "s" : ""}:{" "}
                              {toolNames.length > 0
                                ? toolNames.length > 2
                                  ? `${toolNames.length} calls`
                                  : toolNames.join(", ")
                                : toolDefinitionCount}
                            </div>
                          )}
                          {s.has_tool_results ? (
                            <div
                              className="shrink-0 px-2.5 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400/90 text-[11px] font-bold uppercase tracking-widest"
                              title="Tool result evidence captured (ingest or trajectory)"
                            >
                              Result
                            </div>
                          ) : null}
                          {requestShapeBadges.map(badge => (
                            <div
                              key={badge.label}
                              className="shrink-0 px-2.5 py-0.5 rounded-full border border-cyan-500/25 bg-cyan-500/10 text-cyan-200/90 text-[11px] font-bold uppercase tracking-widest"
                              title={badge.title}
                            >
                              {badge.label}
                            </div>
                          ))}
                          {captureStateBadge ? (
                            <div
                              className="shrink-0 px-2.5 py-0.5 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-300/90 text-[11px] font-bold uppercase tracking-widest"
                              title={captureStateBadge.title}
                            >
                              {captureStateBadge.label}
                            </div>
                          ) : null}

                          <p className="text-[14px] text-slate-300 truncate flex-1 ml-2">
                            {s.request_prompt || s.user_message || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <div className="flex items-center gap-2 justify-end w-20">
                          <span className="text-xs font-bold text-slate-500 capitalize hidden lg:block">
                            latency
                          </span>
                          <span className="text-[13px] font-mono font-bold text-slate-300">
                            {s.latency_ms != null ? `${s.latency_ms}ms` : "—"}
                          </span>
                        </div>
                        <div
                          className={clsx(
                            "w-6 h-6 rounded-md flex items-center justify-center transition-all duration-300",
                            isExpanded
                              ? "bg-white/10 text-white shadow-lg"
                              : "bg-white/[0.03] text-slate-400 group-hover:bg-white/10 group-hover:text-white"
                          )}
                        >
                          <ChevronDown
                            className={clsx(
                              "w-3.5 h-3.5 transition-transform duration-300",
                              isExpanded && "rotate-180"
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mainContent}
      {/* Save to datasets modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#050814] shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-100 uppercase tracking-[0.18em]">
                    Save logs to datasets
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Select existing datasets for this agent or create a new one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeSaveModal}
                  className="p-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
                  aria-label="Close"
                  disabled={isSavingToDatasets}
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-emerald-300">
                    {snapshotIdsToSave.length} log{snapshotIdsToSave.length !== 1 ? "s" : ""}{" "}
                    selected
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Node-scoped only. Datasets from other nodes are hidden.
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                      Existing datasets
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {datasetsForSave.length} available
                    </span>
                  </div>
                  {datasetsForSave.length === 0 ? (
                    <div className="px-3 py-2 rounded-lg border border-dashed border-white/10 text-[11px] text-slate-500">
                      No datasets yet. Create a new dataset below.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {datasetsForSave.map(ds => {
                        const id = String(ds.id);
                        const label = (ds.label?.trim() || `Dataset ${id.slice(0, 8)}`) as string;
                        const count = typeof ds.snapshot_count === "number" ? ds.snapshot_count : 0;
                        const checked = selectedDatasetIdsForSave.has(id);
                        return (
                          <label
                            key={id}
                            className={clsx(
                              "flex items-center gap-3 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors",
                              checked
                                ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                                : "border-white/10 bg-white/[0.02] text-slate-200 hover:border-white/20 hover:bg-white/5"
                            )}
                          >
                            <input
                              type="checkbox"
                              className="w-3.5 h-3.5 rounded border border-white/30 bg-black/40"
                              checked={checked}
                              onChange={() =>
                                setSelectedDatasetIdsForSave(prev => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                            />
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{label}</div>
                              <div className="text-[10px] text-slate-400">
                                {count} log{count !== 1 ? "s" : ""}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-white/10 pt-3">
                  <span className="block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 mb-2">
                    Create new dataset
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newDatasetName}
                      onChange={e => setNewDatasetName(e.target.value)}
                      placeholder="Dataset name (optional)"
                      maxLength={200}
                      className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-fuchsia-500/60"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    If you enter a name, a new dataset will be created and these logs will be
                    included.
                  </p>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between bg-black/40">
                <button
                  type="button"
                  onClick={closeSaveModal}
                  disabled={isSavingToDatasets}
                  className="px-4 py-1.5 rounded-lg border border-white/15 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSelectionToDatasets}
                  disabled={isSavingToDatasets}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/60 text-xs font-bold uppercase tracking-wide text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingToDatasets && (
                    <span className="inline-block w-3 h-3 border-2 border-emerald-300 border-t-transparent rounded-full animate-spin" />
                  )}
                  {isSavingToDatasets ? "Saving…" : "Save to datasets"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Expanded Data Block Modal */}
      <AnimatePresence>
        {expandedId &&
          (() => {
            const s = snapshots.find(snap => String(snap.id) === String(expandedId));
            if (!s) return null;
            const cacheKey = projectId && expandedId ? `${projectId}-${expandedId}` : "";
            const fullSnap =
              detailFetchedSnapshot ??
              (cacheKey ? snapshotDetailCacheRef.current.get(cacheKey) : undefined);
            const snapshotToShow = (fullSnap ?? s) as ClinicalSnapshot;
            const traceKey = String(snapshotToShow.trace_id || "");
            const policyStateForModal = policyByTrace[traceKey] ||
              policyByTrace[String(snapshotToShow.id)] || { status: "idle" as const };
            const evalRowsForModal = getSnapshotEvalRows(snapshotToShow);
            return (
              <SnapshotDetailModal
                snapshot={snapshotToShow}
                onClose={() => setExpandedId(null)}
                policyState={policyStateForModal}
                evalRows={evalRowsForModal}
                savedEvalConfig={savedEvalConfig}
                evalEnabled={evalEnabled}
                releaseGateHref={
                  orgId
                    ? `/organizations/${orgId}/projects/${projectId}/release-gate`
                    : undefined
                }
              />
            );
          })()}
      </AnimatePresence>
    </>
  );
};

export default ClinicalLog;
