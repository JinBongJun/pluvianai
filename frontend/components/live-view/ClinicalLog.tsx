import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal } from "lucide-react";
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
import { logger } from "@/lib/logger";
import { getEnabledCheckIdsFromConfig, getEvalCheckLabel } from "@/lib/evalPresentation";
import { getProjectPermissionToast } from "@/lib/projectAccess";
import { LiveIssueDetailDrawer } from "@/components/live-view/LiveIssueDetailDrawer";
import { LiveIssueRow } from "@/components/live-view/LiveIssueRow";
import { LiveIssuesToolbar } from "@/components/live-view/LiveIssuesToolbar";
import { LiveSaveToDatasetsModal } from "@/components/live-view/LiveSaveToDatasetsModal";
import { buildLiveIssueRowModel } from "@/components/live-view/liveIssueRowModel";

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
  worst: "Needs attention",
  healthy: "Looks good",
};
type SortMode = "newest" | "oldest" | "latency_desc" | "latency_asc";
const SORT_MODE_LABELS: Record<SortMode, string> = {
  newest: "Newest",
  oldest: "Oldest",
  latency_desc: "Slowest",
  latency_asc: "Fastest",
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

function formatPrettyTime(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.toLocaleDateString("en-US")} ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}`;
}

function safeStringify(val: unknown): string {
  if (val === null || val === undefined || val === "") return "-";
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

export const ClinicalLog: React.FC<ClinicalLogProps> = ({
  projectId,
  agentId,
  orgId,
  onLogsMutated,
}) => {
  const toast = useToast();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [detailModalId, setDetailModalId] = React.useState<string | null>(null);
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
    const persisted = Number(
      settingsData?.diagnostic_config?.clinical_log?.window_limit ??
        settingsData?.diagnostic_config?.eval?.window?.limit
    );
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
      await liveViewAPI.updateAgentSettings(projectId, agentId, {
        diagnostic_config: {
          clinical_log: { window_limit: limit },
        },
      });
      await mutateSettings();
    } catch (error) {
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Updating Live View log settings",
        error,
      });
      toast.showToast(
        permissionToast?.message ?? "Failed to update Live View log settings.",
        permissionToast?.tone ?? "error"
      );
    } finally {
      // Keep UI responsive; no extra local draft state to reset.
    }
  };

  const snapshots = React.useMemo(
    () => ((data?.items || []) as ClinicalSnapshot[]),
    [data?.items]
  );

  React.useEffect(() => {
    // Collapse expanded card when filters/window change to avoid stale selection confusion.
    setExpandedId(null);
  }, [riskFilter, recentTraceLimit, agentId]);

  const totalSnapshotsCount = React.useMemo(
    () => Number(data?.total_count ?? data?.count ?? snapshots.length),
    [data?.total_count, data?.count, snapshots.length]
  );

  const activeDetailSnapshotId = detailModalId ?? expandedId;
  // List uses light mode (no payload/long text); issue drawer / detail modal need full snapshot. Cache by (projectId, snapshotId).
  const snapshotDetailCacheRef = React.useRef<Map<string, ClinicalSnapshot>>(new Map());
  const [detailFetchedSnapshot, setDetailFetchedSnapshot] = React.useState<ClinicalSnapshot | null>(
    null
  );
  React.useEffect(() => {
    if (!activeDetailSnapshotId || !projectId) {
      setDetailFetchedSnapshot(null);
      return;
    }
    const cacheKey = `${projectId}-${activeDetailSnapshotId}`;
    const cached = snapshotDetailCacheRef.current.get(cacheKey);
    if (cached) {
      setDetailFetchedSnapshot(cached);
      return;
    }
    const s = snapshots.find(snap => String(snap.id) === String(activeDetailSnapshotId));
    setDetailFetchedSnapshot(null);
    liveViewAPI
      .getSnapshot(projectId, activeDetailSnapshotId)
      .then((full: Record<string, unknown>) => {
        if (!full || String(full.id) !== String(activeDetailSnapshotId)) return;
        const merged = (s ? ({ ...s, ...full } as unknown) : (full as unknown)) as ClinicalSnapshot;
        snapshotDetailCacheRef.current.set(cacheKey, merged);
        setDetailFetchedSnapshot(merged);
      })
      .catch(() => {});
  }, [activeDetailSnapshotId, projectId, snapshots]);

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
  const savedEvalConfig = React.useMemo(
    () => ((settingsData?.diagnostic_config?.eval || {}) as Record<string, any>),
    [settingsData?.diagnostic_config?.eval]
  );
  const runtimeEnabledCheckIds = React.useMemo(() => {
    const checks = Array.isArray(evalRuntime?.checks) ? evalRuntime.checks : [];
    const enabled = checks
      .filter((c: EvalCheckSummary) => c.enabled)
      .map((c: EvalCheckSummary) => c.id);
    if (enabled.length > 0) return enabled;
    const fromSaved = getEnabledCheckIdsFromConfig(savedEvalConfig);
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
        // Evaluation rules:
        // - "fail"     ??counts as failure
        // - "pass"     ??counts as success
        // - anything else (e.g. "not_applicable", "skipped") is treated as neutral
        return st === "fail" ? acc + 1 : acc;
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
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Deleting logs",
        error,
      });
      toast.showToast(
        permissionToast?.message ?? "Failed to delete selected logs. Please try again.",
        permissionToast?.tone ?? "error"
      );
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
      const permissionToast = getProjectPermissionToast({
        featureLabel: "Saving logs to datasets",
        error: e,
      });
      const msg =
        permissionToast?.message ??
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to save logs to datasets";
      toast.showToast(
        typeof msg === "string" ? msg : "Failed to save logs to datasets",
        permissionToast?.tone ?? "error"
      );
    } finally {
      setIsSavingToDatasets(false);
    }
  };

  const expandedSnapshot = React.useMemo(() => {
    if (!expandedId) return null;
    const fromList = snapshots.find(snap => String(snap.id) === String(expandedId));
    if (!fromList) return null;
    if (detailFetchedSnapshot && String(detailFetchedSnapshot.id) === String(expandedId)) {
      return detailFetchedSnapshot;
    }
    return fromList;
  }, [detailFetchedSnapshot, expandedId, snapshots]);

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
    <div className="relative flex h-0 flex-1 min-h-0 flex-col overflow-hidden bg-[#111216]">
      <LiveIssuesToolbar
        visibleCount={visibleSnapshots.length}
        totalCount={totalSnapshotsCount}
        recentTraceLimit={recentTraceLimit}
        riskFilter={riskFilter}
        riskFilterLabels={RISK_FILTER_LABELS}
        sortMode={sortMode}
        sortLabels={SORT_MODE_LABELS}
        logLimitOptions={LOG_LIMIT_OPTIONS}
        onRiskFilterChange={setRiskFilter}
        onRecentTraceLimitChange={value => void saveRecentTraceLimit(value)}
        onSortModeChange={setSortMode}
        isSelectMode={isSelectMode}
        isRemoveMode={isRemoveMode}
        selectedIdsSize={selectedIds.size}
        selectedRemoveIdsSize={selectedRemoveIds.size}
        visibleSnapshotsCount={visibleSnapshots.length}
        isSavingToDatasets={isSavingToDatasets}
        isDeletingSnapshots={isDeletingSnapshots}
        onToggleSelectMode={() => {
          setIsSelectMode(mode => !mode);
          setIsRemoveMode(false);
          setSelectedRemoveIds(new Set());
          if (isSelectMode) setSelectedIds(new Set());
        }}
        onToggleRemoveMode={() => {
          setIsRemoveMode(mode => !mode);
          setIsSelectMode(false);
          setSelectedIds(new Set());
          if (!isRemoveMode) {
            setSelectedRemoveIds(new Set());
          }
        }}
        onSelectAll={selectAll}
        onSelectAllForRemove={selectAllForRemove}
        onOpenSaveModal={openSaveToDatasetsModal}
        onDeleteSelected={() => void deleteSelectedSnapshots()}
      />
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
        className={clsx(
          "relative h-0 flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar p-4 md:p-6 lg:p-8",
          expandedSnapshot ? "xl:pr-[34rem]" : null
        )}
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
                <div className="w-[14rem] shrink-0 capitalize">issue</div>
              )}
              <div className="flex-1 min-w-0 capitalize">case</div>
            </div>

            <div className="flex items-center gap-4 shrink-0 pr-2">
              <div className="w-[13rem] shrink-0 capitalize">status</div>
              <div className="w-[8rem] shrink-0 text-right capitalize">action</div>
            </div>
          </div>

          {isEmptyResult ? (
            <div className="p-10 text-center space-y-4 m-6 border border-dashed border-white/5 rounded-3xl">
              <Terminal className="w-8 h-8 text-slate-700 mx-auto" />
              <p className="text-sm font-medium text-slate-500 leading-relaxed">
                {riskFilter === "all"
                  ? "No issues yet for this agent. New runs will appear here automatically."
                  : `No issues match ${RISK_FILTER_LABELS[riskFilter]}. Try All or raise Show limit.`}
              </p>
              {riskFilter !== "all" && (
                <button
                  onClick={() => setRiskFilter("all")}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
                >
                  Show all
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleSnapshots.map(s => {
                const isExpanded = expandedId === s.id;
                const fullTime = formatPrettyTime(s.created_at);
                const toolNames = extractToolNames(s);
                const toolDefinitionCount = getToolDefinitionCount(s, toolNames);
                const hasPolicyContext = toolDefinitionCount > 0;
                const captureStateBadge = getCaptureStateBadge(s);
                const requestShapeBadges = getRequestShapeBadges(s);
                const traceKey = String(s.trace_id || "");
                const policyState = policyByTrace[traceKey] ||
                  policyByTrace[String(s.id)] || { status: "idle" as const };
                const evalRows = getSnapshotEvalRows(s);

                // Simple analysis
                const failedCount = getSnapshotFailedCount(s);
                const passedCount = evalRows.filter(r => r.status === "pass").length;
                const firstFailedEvalId = evalRows.find(r => r.status === "fail")?.id;
                const actionHref =
                  orgId && toolDefinitionCount > 0
                    ? `/organizations/${orgId}/projects/${projectId}/release-gate`
                    : null;
                const { issueTitle, casePreview, modelLabel, surfaceStatus, actionLabel } =
                  buildLiveIssueRowModel({
                    requestText: s.request_prompt || s.user_message,
                    model: s.model,
                    failedEvalId: firstFailedEvalId,
                    failedEvalLabel: firstFailedEvalId
                      ? getEvalCheckLabel(firstFailedEvalId, "Check failed")
                      : undefined,
                    hasToolDefinitions: toolDefinitionCount > 0,
                    hasToolResults: Boolean(s.has_tool_results),
                    failedCount,
                    passedCount,
                    evalRowsCount: evalRows.length,
                    actionHref,
                  });

                return (
                  <LiveIssueRow
                    key={s.id}
                    id={s.id}
                    isExpanded={isExpanded}
                    isSelectMode={isSelectMode}
                    isRemoveMode={isRemoveMode}
                    isSelected={selectedIds.has(String(s.id))}
                    isRemoveSelected={selectedRemoveIds.has(String(s.id))}
                    issueTitle={issueTitle}
                    fullTime={fullTime}
                    modelLabel={modelLabel}
                    casePreview={casePreview}
                    surfaceStatus={surfaceStatus}
                    toolDefinitionCount={toolDefinitionCount}
                    captureStateBadge={captureStateBadge}
                    requestShapeBadges={requestShapeBadges}
                    failedCount={failedCount}
                    passedCount={passedCount}
                    actionHref={actionHref}
                    actionLabel={actionLabel}
                    onToggleRow={() => {
                      if (isSelectMode) {
                        toggleSelect(String(s.id));
                      } else if (isRemoveMode) {
                        toggleRemoveSelect(String(s.id));
                      } else {
                        setExpandedId(isExpanded ? null : s.id);
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
        <AnimatePresence>
          {expandedSnapshot && (
            <motion.aside
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-y-8 right-8 z-30"
            >
              <LiveIssueDetailDrawer
                snapshot={expandedSnapshot}
                detailSnapshot={detailFetchedSnapshot as Record<string, unknown> | null}
                issueTitle={
                  buildLiveIssueRowModel({
                    requestText: expandedSnapshot.request_prompt || expandedSnapshot.user_message,
                    model: expandedSnapshot.model,
                    failedEvalId: toEvalRows(expandedSnapshot as unknown as Record<string, unknown>).find(
                      row => row.status === "fail"
                    )?.id,
                    failedEvalLabel: getEvalCheckLabel(
                      toEvalRows(expandedSnapshot as unknown as Record<string, unknown>).find(
                        row => row.status === "fail"
                      )?.id || "",
                      "Check failed"
                    ),
                    hasToolDefinitions:
                      getToolDefinitionCount(expandedSnapshot, extractToolNames(expandedSnapshot)) > 0,
                    hasToolResults: Boolean(expandedSnapshot.has_tool_results),
                    failedCount: getSnapshotFailedCount(expandedSnapshot),
                    passedCount: toEvalRows(expandedSnapshot as unknown as Record<string, unknown>).filter(
                      row => row.status === "pass"
                    ).length,
                    evalRowsCount: toEvalRows(expandedSnapshot as unknown as Record<string, unknown>).length,
                    actionHref: orgId
                      ? `/organizations/${orgId}/projects/${projectId}/release-gate`
                      : null,
                  }).issueTitle
                }
                toolDefinitionCount={getToolDefinitionCount(
                  expandedSnapshot,
                  extractToolNames(expandedSnapshot)
                )}
                evalRows={toEvalRows(expandedSnapshot as unknown as Record<string, unknown>)}
                releaseGateHref={
                  orgId
                    ? `/organizations/${orgId}/projects/${projectId}/release-gate`
                    : undefined
                }
                formatPrettyTime={formatPrettyTime}
                onClose={() => setExpandedId(null)}
                onOpenFullDetails={() => setDetailModalId(expandedId)}
              />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <>
      {mainContent}
      <LiveSaveToDatasetsModal
        isOpen={isSaveModalOpen}
        isSaving={isSavingToDatasets}
        snapshotIdsCount={snapshotIdsToSave.length}
        datasets={datasetsForSave}
        selectedDatasetIds={selectedDatasetIdsForSave}
        newDatasetName={newDatasetName}
        onClose={closeSaveModal}
        onToggleDataset={id =>
          setSelectedDatasetIdsForSave(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        onDatasetNameChange={setNewDatasetName}
        onSubmit={saveSelectionToDatasets}
      />
      {/* Expanded Data Block Modal */}
      <AnimatePresence>
        {detailModalId &&
          (() => {
            const s = snapshots.find(snap => String(snap.id) === String(detailModalId));
            if (!s) return null;
            const cacheKey = projectId && detailModalId ? `${projectId}-${detailModalId}` : "";
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
                onClose={() => setDetailModalId(null)}
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

