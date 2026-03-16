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
} from "lucide-react";
import clsx from "clsx";
import { behaviorAPI, liveViewAPI } from "@/lib/api";
import { getRateLimitInfo, isRateLimitError } from "@/lib/api/client";
import { toEvalRows } from "@/lib/evalRows";
import useSWR, { mutate as globalMutate } from "swr";
import { SnapshotDetailModal } from "@/components/shared/SnapshotDetailModal";
import { useToast } from "@/components/ToastContainer";

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
  tool_calls_summary?: Array<{ name: string; arguments?: string | Record<string, any> }>;
}

interface ClinicalLogProps {
  projectId: number;
  agentId: string;
}

const MIN_LAST_N_RUNS = 10;
const MAX_LAST_N_RUNS = 200;
const MAX_STEP_ROWS = 30;
const DEFAULT_LAST_N_RUNS = 30;

type RiskFilter = "all" | "worst" | "healthy";
const RISK_FILTER_LABELS: Record<RiskFilter, string> = {
  all: "ALL",
  worst: "FLAGGED",
  healthy: "HEALTHY",
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
      const warn = toFiniteNumber(cfg?.warn_ms, 2000);
      const crit = toFiniteNumber(cfg?.crit_ms, 5000);
      configStr = `warn > ${warn}ms, crit > ${crit}ms`;
      const ms = s.latency_ms ?? 0;
      return { actualStr: `${ms}ms`, configStr };
    }
    case "status_code": {
      const warnFrom = toFiniteNumber(cfg?.warn_from, 400);
      const critFrom = toFiniteNumber(cfg?.crit_from, 500);
      configStr = `warn ≥ ${warnFrom}, crit ≥ ${critFrom}`;
      const code = s.status_code ?? 200;
      return { actualStr: String(code), configStr };
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

export const ClinicalLog: React.FC<ClinicalLogProps> = ({ projectId, agentId }) => {
  const toast = useToast();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [recentTraceLimit, setRecentTraceLimit] = React.useState<number>(DEFAULT_LAST_N_RUNS);
  const [recentTraceInput, setRecentTraceInput] = React.useState<string>(
    String(DEFAULT_LAST_N_RUNS)
  );
  const [isSavingLimit, setIsSavingLimit] = React.useState(false);
  const [riskFilter, setRiskFilter] = React.useState<RiskFilter>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("newest");
  const [policyByTrace, setPolicyByTrace] = React.useState<Record<string, PolicyState>>({});
  const [isSelectMode, setIsSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isSavingToDatasets, setIsSavingToDatasets] = React.useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = React.useState(false);
  const [snapshotIdsToSave, setSnapshotIdsToSave] = React.useState<number[]>([]);
  const [selectedDatasetIdsForSave, setSelectedDatasetIdsForSave] = React.useState<Set<string>>(
    new Set()
  );
  const [newDatasetName, setNewDatasetName] = React.useState("");

  // Keep log selection strictly scoped to the current node.
  React.useEffect(() => {
    setSelectedIds(new Set());
    setIsSelectMode(false);
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
      setRecentTraceInput(String(clamped));
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
    { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const saveRecentTraceLimit = async () => {
    if (!projectId || !agentId) return;
    const parsedInput = Number(recentTraceInput);
    const limit = clampRuns(Number.isFinite(parsedInput) ? parsedInput : recentTraceLimit);
    setRecentTraceLimit(limit);
    setRecentTraceInput(String(limit));
    setIsSavingLimit(true);
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
      setIsSavingLimit(false);
    }
  };

  const snapshots = (data?.items || []) as ClinicalSnapshot[];
  const isRunsInputDirty = React.useMemo(() => {
    const parsed = Number(recentTraceInput);
    if (!Number.isFinite(parsed)) return true;
    return clampRuns(parsed) !== recentTraceLimit;
  }, [recentTraceInput, recentTraceLimit]);

  React.useEffect(() => {
    // Collapse expanded card when filters/window change to avoid stale selection confusion.
    setExpandedId(null);
  }, [riskFilter, recentTraceLimit, agentId]);

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
    () => snapshots.some(s => toEvalRows(s as unknown as Record<string, unknown>).length > 0),
    [snapshots]
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
        // Gate/quality policy: both "fail" and "not_applicable" count as failures.
        return st === "fail" || st === "not_applicable" ? acc + 1 : acc;
      }, 0);
    },
    [getSnapshotEvalRows]
  );
  const filteredSnapshots = React.useMemo(() => {
    const hasEvalContext = hasAnyEvalContext;
    const isEvalFlagged = (s: ClinicalSnapshot) => getSnapshotFailedCount(s) > 0;

    if (riskFilter === "all") return snapshots;
    if (riskFilter === "worst") {
      // FLAGGED: prefer eval-based failure signal; fallback to backend critical flag.
      return snapshots.filter(s => (hasEvalContext ? isEvalFlagged(s) : Boolean(s.is_worst)));
    }
    // HEALTHY: no eval failures (or no backend critical flag when eval context is unavailable)
    return snapshots.filter(s => (hasEvalContext ? !isEvalFlagged(s) : !s.is_worst));
  }, [snapshots, riskFilter, hasAnyEvalContext, getSnapshotFailedCount]);
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
          message: status === "pass" ? "Policy check passed." : "Policy violations detected.",
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
  const isRateLimited = isRateLimitError(error);
  const rateLimitInfo = getRateLimitInfo(error);

  const mainContent = (
    <div className="flex flex-col h-full min-h-0 bg-[#111216]">
      {/* Log Header Summary */}
      <div className="p-5 flex items-center justify-between gap-4 border-b border-white/[0.04] bg-[#18191e]">
        <div className="flex items-center">
          <span className="px-2 py-0.5 rounded-md text-[13px] font-mono text-slate-400 capitalize tracking-wide">
            Total {visibleSnapshots.length} {visibleSnapshots.length === 1 ? "Run" : "Runs"}
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
                    ? "FLAGGED: Issues detected"
                    : mode === "healthy"
                      ? "HEALTHY: No issues"
                      : "ALL"
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

          {/* Limit Input */}
          <div className="flex items-center gap-1.5 bg-[#030806] border border-white/[0.04] rounded-xl mb-0 pl-3 focus-within:border-emerald-500/50 transition-colors group">
            <span className="text-[11px] font-black uppercase text-slate-600 tracking-wider group-focus-within:text-emerald-500/70">
              LIMIT
            </span>
            <input
              type="number"
              min={MIN_LAST_N_RUNS}
              max={MAX_LAST_N_RUNS}
              value={recentTraceInput}
              onChange={e => setRecentTraceInput(e.target.value)}
              onBlur={() => {
                const parsed = Number(recentTraceInput);
                if (!Number.isFinite(parsed)) {
                  setRecentTraceInput(String(recentTraceLimit));
                } else {
                  const val = clampRuns(parsed);
                  setRecentTraceInput(String(val));
                  if (val !== recentTraceLimit) {
                    void saveRecentTraceLimit();
                  }
                }
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              className="w-[42px] bg-transparent py-1.5 text-[13px] text-slate-200 font-mono outline-none"
              title={`Max items (${MIN_LAST_N_RUNS} to ${MAX_LAST_N_RUNS})`}
            />
          </div>

          {/* Sort */}
          <div className="bg-[#030806] border border-white/[0.04] rounded-xl hover:border-white/10 transition-colors focus-within:border-emerald-500/50">
            <select
              value={sortMode}
              onChange={e => setSortMode(e.target.value as SortMode)}
              className="pl-3 pr-2 py-1.5 bg-transparent text-xs font-bold uppercase tracking-wider text-slate-300 outline-none cursor-pointer"
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
            {isSelectMode ? "CANCEL" : "SAVE"}
          </button>

          {isSelectMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="px-3 py-1.5 rounded-xl bg-[#030806] border border-white/[0.04] text-[12px] font-bold uppercase tracking-wide text-slate-300 hover:bg-white/[0.05]"
              >
                {selectedIds.size === visibleSnapshots.length ? "DESELECT" : "ALL"}
              </button>
              <button
                onClick={openSaveToDatasetsModal}
                disabled={selectedIds.size === 0}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-[12px] font-bold uppercase tracking-wide text-emerald-300 hover:bg-emerald-500/30 transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingToDatasets ? "SAVING…" : `SAVE (${selectedIds.size})`}
              </button>
            </div>
          )}
        </div>
      </div>
      {error && (
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
      <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col p-4 md:p-6 lg:p-8 shrink-0">
        <div className="flex flex-col border border-white/[0.06] rounded-[20px] overflow-hidden bg-[#18191e] shadow-2xl mb-12">
          {/* Fixed Data Grid Header */}
          <div className="bg-[#18191e] flex items-center justify-between text-[13px] font-bold text-slate-400 border-b border-white/[0.06] py-3.5 px-6 shrink-0">
            <div className="flex items-center gap-4 flex-1 pr-4">
              {isSelectMode ? (
                <div className="w-8 shrink-0 text-center">SEL</div>
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
                  ? "No clinical snapshots found yet. Try running the agent, then refresh."
                  : `No snapshots match ${RISK_FILTER_LABELS[riskFilter]} filter. Try ALL or increase LIMIT.`}
              </p>
              {riskFilter !== "all" && (
                <button
                  onClick={() => setRiskFilter("all")}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-xs font-bold uppercase tracking-wide text-slate-200 hover:bg-white/[0.06]"
                >
                  SHOW ALL
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
                const hasPolicyContext = toolNames.length > 0;
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
                              EVAL: {failedCount > 0 ? "FAIL" : "PASS"}
                            </div>
                          )}
                          {(s.has_tool_calls || toolNames.length > 0) && (
                            <div
                              className="shrink-0 px-2.5 py-0.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-400/90 text-[11px] font-bold uppercase tracking-widest flex items-center gap-1"
                              title={
                                toolNames.length > 0 ? `Tools: ${toolNames.join(", ")}` : "Tool use"
                              }
                            >
                              Tool{toolNames.length !== 1 ? "s" : ""}:{" "}
                              {toolNames.length > 0
                                ? toolNames.length > 2
                                  ? `${toolNames.length} calls`
                                  : toolNames.join(", ")
                                : "—"}
                            </div>
                          )}

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
                    Select existing datasets for this node or create a new one.
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
              />
            );
          })()}
      </AnimatePresence>
    </>
  );
};

export default ClinicalLog;
