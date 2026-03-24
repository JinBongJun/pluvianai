"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import clsx from "clsx";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Flag,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
  Trash2,
  Upload,
  Activity,
  Settings,
  Play,
  Zap,
  Database,
} from "lucide-react";

import {
  ReleaseGateLayoutGateBody,
  type ReleaseGateLayoutGateBodyProps,
} from "./ReleaseGateLayoutGateBody";
import { ReleaseGateLayoutWrapper } from "./ReleaseGateLayoutWrapper";
import { ReleaseGatePlanLimitedScaffold } from "./ReleaseGatePlanLimitedScaffold";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import {
  SnapshotDetailModal,
  type SnapshotForDetail,
} from "@/components/shared/SnapshotDetailModal";
import { AgentNodePickerModal } from "@/components/release-gate/AgentNodePickerModal";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { DatasetPickerModal } from "@/components/release-gate/DatasetPickerModal";
import { PassRateGauge } from "@/components/release-gate/PassRateGauge";
import { orgKeys } from "@/lib/queryKeys";
import {
  behaviorAPI,
  liveViewAPI,
  organizationsAPI,
  projectUserApiKeysAPI,
  projectsAPI,
  releaseGateAPI,
  type ToolContextPayload,
} from "@/lib/api";
import {
  getApiErrorCode,
  getApiErrorMessage,
  redirectToLogin,
} from "@/lib/api/client";
import { sanitizeReplayBodyOverrides } from "./releaseGateReplayMerge";

import { useReleaseGateBaselineSnapshots } from "./useReleaseGateBaselineSnapshots";
import { useReleaseGateBehaviorDatasets } from "./useReleaseGateBehaviorDatasets";
import { useReleaseGateHistory } from "./useReleaseGateHistory";
import { useReleaseGateAgents } from "./useReleaseGateAgents";
import {
  createDefaultValidateRunDeps,
  useReleaseGateValidateRun,
} from "./useReleaseGateValidateRun";
import type { EditableTool, ReplayProvider } from "./releaseGatePageContent.lib";
import type { GateTab, ThresholdPreset } from "./releaseGateExpandedHelpers";
import {
  applySystemPromptToBody,
  DEFAULT_EVAL_CHECK_VALUE,
  DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY,
  describeMissingProviderKeys,
  editableRequestBodyWithoutTools,
  EMPTY_SWF_ITEMS,
  extractOverridesFromPayload,
  extractSystemPromptFromPayload,
  extractToolResultTextFromSnapshotRecord,
  extractToolsFromPayload,
  asPayloadObject,
  buildBaselineConfigSummary,
  buildFinalCandidateRequest,
  buildToolContextPayload,
  getRequestPart,
  inferProviderFromModelId,
  LIVE_VIEW_CHECK_ORDER,
  normalizeGateThresholds,
  normalizeReplayProvider,
  parseSnapshotCreatedAtMs,
  payloadWithoutModel,
  PROVIDER_PAYLOAD_TEMPLATES,
  REPLAY_THRESHOLD_PRESETS,
  shouldShowEvalSetting,
  snapshotEvalFailed,
} from "./releaseGatePageContent.lib";

export { sanitizePayloadForPreview } from "./releaseGatePageContent.lib";

type ProjectUserApiKeyItem = {
  id: number;
  provider: string;
  agent_id?: string | null;
  is_active: boolean;
  name?: string | null;
  created_at?: string | null;
};

const RELEASE_GATE_REPEAT_OPTIONS = [1, 10, 50, 100] as const;

export default function ReleaseGatePageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = params?.orgId as string;
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;

  const mutateHistoryRef = useRef<(() => unknown) | undefined>(undefined);
  const validateRunDepsRef = useRef(createDefaultValidateRunDeps());

  const { data: project } = useSWR(
    projectId && !isNaN(projectId) ? ["project", projectId] : null,
    async () => {
      try {
        return await projectsAPI.get(projectId);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg = e?.response?.data?.detail ?? e?.response?.data?.error?.message ?? "";
        if (status === 404 && (msg === "Project not found" || msg === "Not Found")) {
          router.replace(orgId ? `/organizations/${orgId}/projects` : "/organizations");
          return undefined;
        }
        throw e;
      }
    }
  );
  const { data: org } = useSWR(orgId ? orgKeys.detail(orgId) : null, () =>
    organizationsAPI.get(orgId)
  );

  const [tab, setTab] = useState<GateTab>("validate");
  const [viewMode, setViewMode] = useState<"map" | "expanded">("map");
  const [repeatRuns, setRepeatRuns] = useState<number>(1);
  const [repeatDropdownOpen, setRepeatDropdownOpen] = useState(false);
  const repeatDropdownRef = useRef<HTMLDivElement>(null);
  const prevAgentIdForBodyOverridesRef = useRef<string | null>(null);
  const isHeavyRepeat = repeatRuns === 50 || repeatRuns === 100;
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (repeatDropdownRef.current && !repeatDropdownRef.current.contains(e.target as Node))
        setRepeatDropdownOpen(false);
    };
    if (repeatDropdownOpen) document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [repeatDropdownOpen]);
  const [thresholdPreset, setThresholdPreset] = useState<ThresholdPreset>("default");
  const [failRateMax, setFailRateMax] = useState<number>(
    REPLAY_THRESHOLD_PRESETS.default.failRateMax
  );
  const [flakyRateMax, setFlakyRateMax] = useState<number>(
    REPLAY_THRESHOLD_PRESETS.default.flakyRateMax
  );

  const showPrimaryValidateLayout = true;
  const [agentId, setAgentId] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<AgentForPicker | null>(null);
  const [agentSelectModalOpen, setAgentSelectModalOpen] = useState(false);
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<"recent" | "datasets">("recent");
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const [datasetSelectModalOpen, setDatasetSelectModalOpen] = useState(false);
  const [newModel, setNewModel] = useState("");
  const [replayProvider, setReplayProvider] = useState<ReplayProvider>("openai");
  const [modelOverrideEnabled, setModelOverrideEnabled] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelProviderTab, setModelProviderTab] = useState<ReplayProvider>("openai");
  const [requestBody, setRequestBody] = useState<Record<string, unknown>>({});
  const [requestJsonDraft, setRequestJsonDraft] = useState<string | null>(null);
  const [requestJsonError, setRequestJsonError] = useState("");
  /** Top-level request fields merged into replay_overrides after config JSON (e.g. attachments, RAG). */
  const [requestBodyOverrides, setRequestBodyOverrides] = useState<Record<string, unknown>>({});
  const [bodyOverridesJsonDraft, setBodyOverridesJsonDraft] = useState<string | null>(null);
  const [bodyOverridesJsonError, setBodyOverridesJsonError] = useState("");
  /** Sanitized per snapshot id → body overrides (merged after global on the server). */
  const [requestBodyOverridesBySnapshotId, setRequestBodyOverridesBySnapshotId] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [bodyOverridesSnapshotDraftRaw, setBodyOverridesSnapshotDraftRaw] = useState<
    Record<string, string>
  >({});
  const [bodyOverridesSnapshotJsonError, setBodyOverridesSnapshotJsonError] = useState<
    Record<string, string>
  >({});
  const [temperatureDraft, setTemperatureDraft] = useState<string | null>(null);
  const [maxTokensDraft, setMaxTokensDraft] = useState<string | null>(null);
  const [toolsList, setToolsList] = useState<EditableTool[]>([]);
  const [toolContextMode, setToolContextMode] = useState<"recorded" | "inject">("recorded");
  const [toolContextScope, setToolContextScope] = useState<"global" | "per_snapshot">(
    "per_snapshot"
  );
  const [toolContextGlobalText, setToolContextGlobalText] = useState("");
  const [toolContextBySnapshotId, setToolContextBySnapshotId] = useState<Record<string, string>>(
    {}
  );
  const [toolContextLoadBusy, setToolContextLoadBusy] = useState(false);
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [toolsHydratedKey, setToolsHydratedKey] = useState("");
  const [overridesHydratedKey, setOverridesHydratedKey] = useState("");
  const [representativeBaselineUserSnapshotId, setRepresentativeBaselineUserSnapshotId] = useState<
    string | null
  >(null);

  const [runDatasetIds, setRunDatasetIds] = useState<string[]>([]);
  const [runSnapshotIds, setRunSnapshotIds] = useState<string[]>([]);
  const [expandedDatasetId, setExpandedDatasetId] = useState<string | null>(null);

  const [criteriaOpen, setCriteriaOpen] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [resultDetailsOpen, setResultDetailsOpen] = useState(false);
  const [selectedRunResultIndex, setSelectedRunResultIndex] = useState<number | null>(null);
  const [expandedCaseIndex, setExpandedCaseIndex] = useState<number | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<{
    caseIndex: number;
    attemptIndex: number;
  } | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [baselineDetailSnapshot, setBaselineDetailSnapshot] = useState<SnapshotForDetail | null>(
    null
  );
  const openBaselineDetailSnapshot = useCallback(
    (snap: Record<string, unknown>) => {
      const id = snap?.id;
      setBaselineDetailSnapshot({ ...snap } as unknown as SnapshotForDetail);
      if (projectId == null || id == null || Number.isNaN(Number(projectId))) return;
      liveViewAPI
        .getSnapshot(projectId, id as string | number)
        .then((full: Record<string, unknown>) => {
          if (!full || String(full.id) !== String(id)) return;
          setBaselineDetailSnapshot(prev => {
            if (!prev || String(prev.id) !== String(id)) return prev;
            return { ...prev, ...full } as SnapshotForDetail;
          });
        })
        .catch(() => {});
    },
    [projectId]
  );
  const {
    isValidating,
    activeJobId,
    cancelRequested,
    result,
    error,
    planError,
    handleValidate,
    handleCancelActiveJob,
    clearRunUi,
  } = useReleaseGateValidateRun({
    projectId,
    depsRef: validateRunDepsRef,
    mutateHistoryRef,
  });
  const runLocked = isValidating || Boolean(activeJobId);
  const {
    historyStatus,
    setHistoryStatus,
    historyTraceId,
    setHistoryTraceId,
    historyDatePreset,
    setHistoryDatePreset,
    historyOffset,
    setHistoryOffset,
    historyLimit,
    historyLoading,
    historyRefreshing,
    historyItems,
    historyTotal,
    mutateHistory,
  } = useReleaseGateHistory({ projectId, runLocked });
  mutateHistoryRef.current = mutateHistory;
  const { data: coreModelsData } = useSWR(
    projectId && !isNaN(projectId) ? ["release-gate-core-models", projectId] : null,
    () => releaseGateAPI.getCoreModels(projectId),
    { isPaused: () => runLocked }
  );
  const agentIdFromUrl = searchParams.get("agent_id")?.trim() ?? "";
  useEffect(() => {
    if (!agentIdFromUrl) return;
    setAgentId(agentIdFromUrl);
    setViewMode("expanded");
  }, [agentIdFromUrl]);

  // When switching nodes, reset JSON/tools state so that seeding reflects the newly selected node.
  useEffect(() => {
    if (!agentId) {
      setRequestBody({});
      setRequestJsonDraft(null);
      setRequestJsonError("");
    setToolsList([]);
    setToolContextMode("recorded");
    setToolContextScope("per_snapshot");
    setToolContextGlobalText("");
    setToolContextBySnapshotId({});
    setToolContextLoadBusy(false);
    setToolsHydratedKey("");
    setOverridesHydratedKey("");
    setRepresentativeBaselineUserSnapshotId(null);
    clearRunUi();
    return;
  }
  // For a new agent, clear previous node's config so that node-level seeding can populate fresh defaults.
  setRequestBody({});
  setRequestJsonDraft(null);
  setRequestJsonError("");
  setToolsList([]);
  setToolContextMode("recorded");
  setToolContextScope("per_snapshot");
  setToolContextGlobalText("");
  setToolContextBySnapshotId({});
  setToolContextLoadBusy(false);
  setToolsHydratedKey("");
  setOverridesHydratedKey("");
  setRepresentativeBaselineUserSnapshotId(null);
  clearRunUi();
  }, [agentId, clearRunUi]);

  useEffect(() => {
    setSelectedRunResultIndex(null);
    setExpandedCaseIndex(null);
    setSelectedAttempt(null);
  }, [result?.report_id]);

  const {
    agentsData,
    agentsLoading,
    agentsError,
    mutateAgents,
    agentsLoaded,
    agents,
  } = useReleaseGateAgents({ projectId, runLocked });

  useEffect(() => {
    if (agentId && agents.length > 0) {
      const match = agents.find(a => a.agent_id === agentId);
      setSelectedAgent(prev => (prev?.agent_id === agentId ? prev : (match ?? null)));
    } else if (!agentId) {
      setSelectedAgent(null);
    }
  }, [agentId, agents]);

  useEffect(() => {
    setRunDatasetIds(datasetIds.length ? [...datasetIds] : []);
  }, [datasetIds.join(",")]);
  useEffect(() => {
    setRunSnapshotIds(snapshotIds.length ? [...snapshotIds] : []);
  }, [snapshotIds.join(",")]);

  const {
    datasets,
    datasetsLoading,
    datasetsError,
    mutateDatasets,
    normalizedRunDatasetIds,
    datasetSnapshots,
    datasetSnapshotsLoading,
    datasetSnapshotsError,
    datasetSnapshots404,
    mutateDatasetSnapshots,
    expandedDatasetSnapshots,
    expandedDatasetSnapshotsLoading,
    expandedDatasetSnapshotsError,
    expandedDatasetSnapshots404,
    mutateExpandedDatasetSnapshots,
    selectedDatasetSnapshotCount,
  } = useReleaseGateBehaviorDatasets({
    projectId,
    agentId,
    runLocked,
    expandedDatasetId,
    runDatasetIds,
  });

  const {
    recentSnapshots,
    recentSnapshotsTotalAvailable,
    recentSnapshotsLoading,
    recentSnapshotsError,
    mutateRecentSnapshots,
    selectedSnapshotIdsForRun,
    baselineSnapshotsById,
    baselineSnapshotsForRun,
    autoRepresentativeBaselineSnapshotId,
    effectiveRepresentativeBaselineSnapshotId,
    baselineSeedSnapshot,
    baselineSeedSnapshotId,
    representativeBaselinePickerOptions,
  } = useReleaseGateBaselineSnapshots({
    projectId,
    agentId,
    runLocked,
    dataSource,
    runSnapshotIds,
    datasetSnapshots,
    representativeBaselineUserSnapshotId,
  });

  const selectedBaselineCount =
    runSnapshotIds.length > 0 ? runSnapshotIds.length : selectedDatasetSnapshotCount;
  const selectedDataSummary =
    runSnapshotIds.length > 0
      ? `${runSnapshotIds.length} live log${runSnapshotIds.length === 1 ? "" : "s"} selected`
      : runDatasetIds.length > 0
        ? `${selectedDatasetSnapshotCount} snapshot${selectedDatasetSnapshotCount === 1 ? "" : "s"} from ${runDatasetIds.length} saved dataset${runDatasetIds.length === 1 ? "" : "s"}`
        : "Choose baseline data from Live Logs or Saved Data.";

  const dataSourceLabel = useMemo(() => {
    if (dataSource === "datasets") {
      return datasetIds.length > 0 ? "Dataset(s)" : "";
    }
    if (dataSource === "recent") {
      return snapshotIds.length > 0 ? "Recent runs" : "";
    }
    return "";
  }, [dataSource, snapshotIds.length, datasetIds.length]);

  useEffect(() => {
    setToolContextBySnapshotId(prev => {
      const next = { ...prev };
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      for (const id of selectedSnapshotIdsForRun) {
        const sid = String(id);
        if (!(sid in next)) next[sid] = "";
      }
      return next;
    });
  }, [selectedSnapshotIdsForRun]);

  useEffect(() => {
    setRequestBodyOverridesBySnapshotId(prev => {
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
    setBodyOverridesSnapshotDraftRaw(prev => {
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
    setBodyOverridesSnapshotJsonError(prev => {
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
  }, [selectedSnapshotIdsForRun]);

  useEffect(() => {
    const cur = agentId.trim();
    if (prevAgentIdForBodyOverridesRef.current !== null && prevAgentIdForBodyOverridesRef.current !== cur) {
      setRequestBodyOverrides({});
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
      setRequestBodyOverridesBySnapshotId({});
      setBodyOverridesSnapshotDraftRaw({});
      setBodyOverridesSnapshotJsonError({});
    }
    prevAgentIdForBodyOverridesRef.current = cur;
  }, [agentId]);

  useEffect(() => {
    const allowed = new Set(selectedSnapshotIdsForRun.map(String));
    if (
      representativeBaselineUserSnapshotId &&
      !allowed.has(representativeBaselineUserSnapshotId)
    ) {
      setRepresentativeBaselineUserSnapshotId(null);
    }
  }, [selectedSnapshotIdsForRun, representativeBaselineUserSnapshotId]);

  const handleLoadToolContextFromSnapshots = useCallback(async () => {
    if (!projectId || Number.isNaN(projectId)) return;
    const ids = selectedSnapshotIdsForRun.map(String).filter(Boolean);
    if (ids.length === 0) return;
    setToolContextLoadBusy(true);
    try {
      if (toolContextScope === "global") {
        const preferred =
          effectiveRepresentativeBaselineSnapshotId &&
          ids.includes(effectiveRepresentativeBaselineSnapshotId)
            ? effectiveRepresentativeBaselineSnapshotId
            : ids[0];
        const snap = await liveViewAPI.getSnapshot(projectId, preferred);
        setToolContextGlobalText(
          extractToolResultTextFromSnapshotRecord(snap as Record<string, unknown>)
        );
      } else {
        const merged: Record<string, string> = {};
        for (const id of ids) {
          const snap = await liveViewAPI.getSnapshot(projectId, id);
          merged[id] = extractToolResultTextFromSnapshotRecord(snap as Record<string, unknown>);
        }
        setToolContextBySnapshotId(prev => ({ ...prev, ...merged }));
      }
    } catch {
      // ignore
    } finally {
      setToolContextLoadBusy(false);
    }
  }, [
    projectId,
    selectedSnapshotIdsForRun,
    toolContextScope,
    effectiveRepresentativeBaselineSnapshotId,
  ]);

  const baselinePayload = useMemo(() => {
    const raw = asPayloadObject(baselineSeedSnapshot?.payload);
    return raw ? getRequestPart(raw) : null;
  }, [baselineSeedSnapshot]);
  const baselineTools = useMemo(() => extractToolsFromPayload(baselinePayload), [baselinePayload]);
  const baselineOverrides = useMemo(
    () => extractOverridesFromPayload(baselinePayload),
    [baselinePayload]
  );

  const {
    data: selectedRunReport,
    isLoading: selectedRunReportLoading,
    error: selectedRunReportError,
  } = useSWR(
    selectedRunId && projectId && !isNaN(projectId)
      ? ["release-gate-report", projectId, selectedRunId]
      : null,
    () => behaviorAPI.exportReport(projectId, selectedRunId!, "json"),
    { isPaused: () => runLocked }
  );

  const singleSnapshotEvalKey =
    agentId?.trim() && projectId && !isNaN(projectId) ? ["agent-eval", projectId, agentId] : null;
  const { data: agentEvalData } = useSWR(
    singleSnapshotEvalKey,
    () => liveViewAPI.getAgentEvaluation(projectId, agentId),
    { isPaused: () => runLocked }
  );
  const liveNodeLatestKey =
    agentId?.trim() && projectId && !isNaN(projectId)
      ? ["release-gate-live-node-latest", projectId, agentId.trim()]
      : null;
  const { data: liveNodeLatestData } = useSWR(
    liveNodeLatestKey,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: agentId.trim(), limit: 1, offset: 0 }),
    { isPaused: () => runLocked }
  );
  const liveNodeLatestSnapshot = useMemo(() => {
    const items = (liveNodeLatestData as Record<string, unknown> | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }, [liveNodeLatestData]);
  const liveNodeLatestPayload = useMemo(() => {
    const raw = asPayloadObject(liveNodeLatestSnapshot?.payload);
    return raw ? getRequestPart(raw) : null;
  }, [liveNodeLatestSnapshot]);

  const runDataModel = useMemo(() => {
    const latestModel = liveNodeLatestSnapshot?.model;
    if (typeof latestModel === "string" && latestModel.trim()) return latestModel.trim();
    const fromSnapshot = baselineSeedSnapshot?.model;
    if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
    const latestPayloadModel = liveNodeLatestPayload?.model;
    if (typeof latestPayloadModel === "string" && latestPayloadModel.trim())
      return latestPayloadModel.trim();
    const fromPayload = baselinePayload?.model;
    if (typeof fromPayload === "string" && fromPayload.trim()) return fromPayload.trim();
    return "";
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, liveNodeLatestPayload, baselinePayload]);
  const replayProviderModelLibrary = useMemo(() => {
    const providers = (coreModelsData as { providers?: Record<string, unknown> } | undefined)?.providers;
    if (!providers || typeof providers !== "object") {
      return DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY;
    }
    const normalized: Record<ReplayProvider, string[]> = {
      openai: Array.isArray(providers.openai)
        ? providers.openai.map(v => String(v)).filter(Boolean)
        : [],
      anthropic: Array.isArray(providers.anthropic)
        ? providers.anthropic.map(v => String(v)).filter(Boolean)
        : [],
      google: Array.isArray(providers.google)
        ? providers.google.map(v => String(v)).filter(Boolean)
        : [],
    };
    return {
      openai: normalized.openai.length
        ? normalized.openai
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.openai,
      anthropic: normalized.anthropic.length
        ? normalized.anthropic
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.anthropic,
      google: normalized.google.length
        ? normalized.google
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.google,
    };
  }, [coreModelsData]);
  const runDataProvider = useMemo(() => {
    const fromLatest = normalizeReplayProvider(liveNodeLatestSnapshot?.provider);
    if (fromLatest) return fromLatest;
    const fromBaseline = normalizeReplayProvider(
      (baselineSeedSnapshot as Record<string, unknown> | null)?.provider
    );
    if (fromBaseline) return fromBaseline;
    return inferProviderFromModelId(runDataModel);
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, runDataModel]);
  const runDataPrompt = useMemo(() => {
    const latestPrompt = liveNodeLatestSnapshot?.system_prompt;
    if (typeof latestPrompt === "string" && latestPrompt.trim()) return latestPrompt.trim();
    const extractedFromLatestPayload = extractSystemPromptFromPayload(liveNodeLatestPayload);
    if (extractedFromLatestPayload) return extractedFromLatestPayload;
    const fromSnapshot = baselineSeedSnapshot?.system_prompt;
    if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
    return extractSystemPromptFromPayload(baselinePayload);
  }, [liveNodeLatestSnapshot, liveNodeLatestPayload, baselineSeedSnapshot, baselinePayload]);
  const nodeBasePayload = useMemo(() => {
    if (baselinePayload) return baselinePayload;
    if (liveNodeLatestPayload) return liveNodeLatestPayload;
    const provider =
      normalizeReplayProvider(runDataProvider) || inferProviderFromModelId(runDataModel);
    if (!provider) return null;
    const providerTemplate = PROVIDER_PAYLOAD_TEMPLATES[provider];
    return providerTemplate ? { ...providerTemplate } : null;
  }, [baselinePayload, liveNodeLatestPayload, runDataProvider, runDataModel]);
  const configSourceLabel = useMemo(() => {
    if (runSnapshotIds.length > 0 && baselinePayload) return "Selected live logs";
    if (runDatasetIds.length > 0 && baselinePayload) return "Selected saved data";
    if (liveNodeLatestPayload) return "Latest live snapshot";
    if (nodeBasePayload) return "Provider template";
    return "";
  }, [
    runSnapshotIds.length,
    runDatasetIds.length,
    baselinePayload,
    liveNodeLatestPayload,
    nodeBasePayload,
  ]);

  // When a node is first selected (and no explicit baseline selection yet), seed the JSON payload
  // and tools list from the latest live snapshot (or provider template) so the panel shows a sensible default config.
  useEffect(() => {
    if (!agentId?.trim()) return;
    // If user has already picked specific snapshots/datasets, or we already hydrated for this agent, skip.
    if (selectedSnapshotIdsForRun.length > 0) return;
    if (baselineSeedSnapshot || baselinePayload) return;
    if (overridesHydratedKey === `node:${agentId}`) return;

    // Don't override user-edited JSON/tools for the same node.
    if (Object.keys(requestBody).length > 0 || toolsList.length > 0) return;

    const providerTemplate = (() => {
      const p = normalizeReplayProvider(runDataProvider) || inferProviderFromModelId(runDataModel);
      return p ? PROVIDER_PAYLOAD_TEMPLATES[p] : null;
    })();

    let seedBody: Record<string, unknown> | null = null;
    if (liveNodeLatestPayload) {
      const fromPayload = payloadWithoutModel(liveNodeLatestPayload);
      seedBody = providerTemplate ? { ...providerTemplate, ...fromPayload } : fromPayload;
    } else if (providerTemplate) {
      seedBody = { ...providerTemplate };
    }

    if (!seedBody || Object.keys(seedBody).length === 0) return;
    setRequestBody(seedBody);

    const seedTools = liveNodeLatestPayload ? extractToolsFromPayload(liveNodeLatestPayload) : [];
    if (seedTools.length) setToolsList(seedTools);

    setOverridesHydratedKey(`node:${agentId}`);
  }, [
    agentId,
    selectedSnapshotIdsForRun.length,
    baselineSeedSnapshot,
    baselinePayload,
    liveNodeLatestPayload,
    requestBody,
    toolsList.length,
    runDataProvider,
    runDataModel,
    overridesHydratedKey,
  ]);
  const effectiveProvider = modelOverrideEnabled ? replayProvider : runDataProvider;
  const effectiveModel = modelOverrideEnabled ? newModel.trim() : runDataModel;

  const canValidate =
    !!agentId?.trim() &&
    ((dataSource === "recent" && runSnapshotIds.length > 0) ||
      (dataSource === "datasets" && runDatasetIds.length > 0));

  const projectUserApiKeysKey =
    projectId && !isNaN(projectId) ? ["project-user-api-keys", projectId] : null;
  const { data: projectUserApiKeysData, isLoading: projectUserApiKeysLoading } = useSWR(
    projectUserApiKeysKey,
    () => projectUserApiKeysAPI.list(projectId),
    { isPaused: () => runLocked }
  );
  const keyPresenceByAgentAndProvider = useMemo(() => {
    const projectDefaultProviders = new Set<ReplayProvider>();
    const nodeScopedProviders = new Set<string>();
    const items = Array.isArray(projectUserApiKeysData)
      ? (projectUserApiKeysData as ProjectUserApiKeyItem[])
      : [];
    for (const item of items) {
      if (!item?.is_active) continue;
      const normalized = normalizeReplayProvider(item.provider);
      if (!normalized) continue;
      const keyAgentId = (item.agent_id || "").trim();
      if (!keyAgentId) {
        projectDefaultProviders.add(normalized);
        continue;
      }
      nodeScopedProviders.add(`${keyAgentId}::${normalized}`);
    }
    return {
      projectDefaultProviders,
      nodeScopedProviders,
    };
  }, [projectUserApiKeysData]);

  const hasEffectiveProviderKey = useCallback(
    (provider: ReplayProvider, keyAgentId: string | null) => {
      const normalizedAgentId = (keyAgentId || "").trim();
      if (
        normalizedAgentId &&
        keyPresenceByAgentAndProvider.nodeScopedProviders.has(`${normalizedAgentId}::${provider}`)
      ) {
        return true;
      }
      return keyPresenceByAgentAndProvider.projectDefaultProviders.has(provider);
    },
    [keyPresenceByAgentAndProvider]
  );

  const requiredProviderResolution = useMemo(() => {
    if (modelOverrideEnabled && replayProvider) {
      return {
        providers: [replayProvider],
        unresolvedSnapshotCount: 0,
      };
    }
    const providers = new Set<ReplayProvider>();
    let unresolvedSnapshotCount = 0;
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) {
        unresolvedSnapshotCount += 1;
        continue;
      }
      providers.add(provider);
    }
    if (providers.size === 0 && runDataProvider) providers.add(runDataProvider);
    return {
      providers: Array.from(providers),
      unresolvedSnapshotCount,
    };
  }, [modelOverrideEnabled, replayProvider, baselineSnapshotsForRun, runDataProvider]);

  const missingProviderKeys = useMemo(() => {
    if (modelOverrideEnabled) return [];
    const missing = new Set<ReplayProvider>();
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) continue;
      const snapshotAgentIdRaw = (snapshot as Record<string, unknown>).agent_id;
      const snapshotAgentId = typeof snapshotAgentIdRaw === "string" ? snapshotAgentIdRaw : null;
      if (!hasEffectiveProviderKey(provider, snapshotAgentId)) {
        missing.add(provider);
      }
    }
    if (missing.size === 0 && requiredProviderResolution.providers.length > 0 && runDataProvider) {
      if (!hasEffectiveProviderKey(runDataProvider, agentId.trim() || null)) {
        missing.add(runDataProvider);
      }
    }
    return Array.from(missing);
  }, [
    modelOverrideEnabled,
    baselineSnapshotsForRun,
    requiredProviderResolution.providers.length,
    runDataProvider,
    hasEffectiveProviderKey,
    agentId,
  ]);

  const keyRegistrationMessage = useMemo(() => {
    if (!canValidate) return "";
    if (modelOverrideEnabled) return "";
    if (projectUserApiKeysLoading) return "Checking required API keys...";
    if (requiredProviderResolution.providers.length === 0) {
      return "Run blocked: provider could not be detected from selected data. Open Live View and verify the latest agent snapshot.";
    }
    if (requiredProviderResolution.unresolvedSnapshotCount > 0) {
      return "Run blocked: one or more selected snapshots have no detectable provider. Open Live View and verify the latest agent snapshot.";
    }
    if (missingProviderKeys.length > 0) {
      return describeMissingProviderKeys(missingProviderKeys);
    }
    return "All required API keys are registered. Ready to run.";
  }, [
    canValidate,
    modelOverrideEnabled,
    projectUserApiKeysLoading,
    requiredProviderResolution.providers.length,
    requiredProviderResolution.unresolvedSnapshotCount,
    missingProviderKeys,
  ]);

  const keyBlocked =
    canValidate &&
    !modelOverrideEnabled &&
    (projectUserApiKeysLoading ||
      requiredProviderResolution.providers.length === 0 ||
      requiredProviderResolution.unresolvedSnapshotCount > 0 ||
      missingProviderKeys.length > 0);
  const modelOverrideInvalid = modelOverrideEnabled && !newModel.trim();
  const runBlockedMessage = modelOverrideInvalid
    ? "Run blocked: select a model id for override or switch back to detected model."
    : keyRegistrationMessage;

  const canRunValidate = canValidate && !keyBlocked && !modelOverrideInvalid;

  const runEvalElements = useMemo(() => {
    const data = agentEvalData as Record<string, unknown> | undefined;
    const configSrc = data?.config as Record<string, unknown> | undefined;
    if (configSrc && typeof configSrc === "object" && !Array.isArray(configSrc)) {
      const fromConfig = LIVE_VIEW_CHECK_ORDER.map(name => {
        const value =
          configSrc[name] !== undefined ? configSrc[name] : DEFAULT_EVAL_CHECK_VALUE[name];
        return { name, value };
      }).filter(({ value }) => value != null && shouldShowEvalSetting(value));
      if (fromConfig.length > 0) return fromConfig;
    }
    // Fallback: use checks from evaluation API (applied to recent logs, e.g. from stored eval_checks_result when no AgentDisplaySetting)
    const checksList = data?.checks as
      | Array<{ id: string; enabled?: boolean; applicable?: number }>
      | undefined;
    if (Array.isArray(checksList) && checksList.length > 0) {
      const applied = checksList
        .filter(c => c.enabled === true || (Number(c.applicable) ?? 0) > 0)
        .map(c => ({ name: c.id, value: { enabled: true } as unknown }));
      if (applied.length > 0) {
        const order = [...LIVE_VIEW_CHECK_ORDER, "coherence"];
        const idx = (name: string) => {
          const i = order.indexOf(name);
          return i === -1 ? 999 : i;
        };
        applied.sort((a, b) => idx(a.name) - idx(b.name));
        return applied;
      }
    }
    return [] as Array<{ name: string; value: unknown }>;
  }, [agentEvalData]);

  const liveViewSettingsHref = `/organizations/${orgId}/projects/${projectId}/live-view`;

  const requestSystemPrompt = useMemo(() => {
    const fromBody =
      typeof requestBody.system_prompt === "string"
        ? requestBody.system_prompt
        : extractSystemPromptFromPayload(requestBody);
    if (fromBody && fromBody.trim()) {
      return fromBody.trim();
    }
    // When the editable request body does not yet contain a prompt (e.g. seeded only
    // with sampling knobs or provider template), fall back to the node's detected
    // system prompt so the textarea is prefilled instead of empty.
    return runDataPrompt || "";
  }, [requestBody, runDataPrompt]);

  validateRunDepsRef.current = {
    canValidate,
    keyBlocked,
    keyRegistrationMessage,
    modelOverrideEnabled,
    newModel,
    replayProvider,
    failRateMax,
    flakyRateMax,
    agentId,
    runSnapshotIds,
    runDatasetIds,
    requestBody,
    requestSystemPrompt,
    toolsList,
    requestBodyOverrides,
    requestBodyOverridesBySnapshotId,
    toolContextMode,
    toolContextScope,
    toolContextGlobalText,
    toolContextBySnapshotId,
    repeatRuns,
  };

  const requestBodyWithoutTools = useMemo(
    () => editableRequestBodyWithoutTools(requestBody),
    [requestBody]
  );
  const requestBodyJson = useMemo(
    () => JSON.stringify(requestBodyWithoutTools, null, 2),
    [requestBodyWithoutTools]
  );
  const requestBodyOverridesJson = useMemo(
    () => JSON.stringify(requestBodyOverrides, null, 2),
    [requestBodyOverrides]
  );

  const baselineConfigSummary = useMemo(() => {
    const source =
      baselinePayload && Object.keys(baselinePayload).length
        ? baselinePayload
        : nodeBasePayload && Object.keys(nodeBasePayload).length
          ? nodeBasePayload
          : null;
    return buildBaselineConfigSummary(source);
  }, [baselinePayload, nodeBasePayload]);

  const finalCandidateRequest = useMemo(
    () =>
      buildFinalCandidateRequest({
        baselineSeedSnapshot,
        baselinePayload,
        nodeBasePayload,
        requestBody,
        requestSystemPrompt,
        modelOverrideEnabled,
        newModel,
        requestBodyOverrides,
        requestBodyOverridesBySnapshotId,
        seedSnapshotId: baselineSeedSnapshotId,
      }),
    [
      baselineSeedSnapshot,
      baselinePayload,
      nodeBasePayload,
      requestBody,
      requestSystemPrompt,
      modelOverrideEnabled,
      newModel,
      requestBodyOverrides,
      requestBodyOverridesBySnapshotId,
      baselineSeedSnapshotId,
    ]
  );

  /**
   * UI preview for what Release Gate validate will override and send.
   * Intentionally excludes snapshot conversation ("messages") so the preview
   * stays clean and doesn't duplicate system prompt content.
   */
  const validateOverridePreview = useMemo(() => {
    const preview: Record<string, unknown> = {
      model_source: modelOverrideEnabled ? "platform" : "detected",
    };

    if (modelOverrideEnabled) {
      const trimmedModel = newModel.trim();
      if (trimmedModel) {
        const inferredProvider = inferProviderFromModelId(trimmedModel);
        const effectiveProvider = inferredProvider || replayProvider;
        preview.new_model = trimmedModel;
        preview.replay_provider = effectiveProvider;
      }
    }

    const sys =
      (typeof requestBody.system_prompt === "string"
        ? requestBody.system_prompt
        : requestSystemPrompt
      ).trim() || undefined;
    if (sys) preview.new_system_prompt = sys;

    const temp = requestBody.temperature;
    if (temp != null && typeof temp === "number" && Number.isFinite(temp) && temp >= 0) {
      preview.replay_temperature = temp;
    }

    const maxTok = requestBody.max_tokens;
    if (
      maxTok != null &&
      (typeof maxTok === "number"
        ? Number.isInteger(maxTok)
        : Number.isInteger(Number(maxTok))) &&
      Number(maxTok) > 0
    ) {
      preview.replay_max_tokens = Number(maxTok);
    }

    const topP = requestBody.top_p;
    if (topP != null && typeof topP === "number" && Number.isFinite(topP)) {
      preview.replay_top_p = topP;
    }

    const overrides: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(requestBody)) {
      if (
        k === "model" ||
        k === "system_prompt" ||
        k === "messages" ||
        k === "temperature" ||
        k === "max_tokens" ||
        k === "top_p"
      ) {
        continue;
      }
      overrides[k] = v;
    }

    // Tools are passed via replay_overrides.tools (built from toolsList),
    // unless requestBody already contains a tools array.
    if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
      overrides.tools = requestBody.tools;
    } else if (toolsList.length > 0) {
      const built: Array<Record<string, unknown>> = [];
      for (const t of toolsList) {
        const name = t.name.trim();
        if (!name) continue;
        let params: Record<string, unknown> = {};
        if (t.parameters.trim()) {
          try {
            const p = JSON.parse(t.parameters.trim());
            if (p && typeof p === "object") params = p as Record<string, unknown>;
          } catch {
            continue;
          }
        }
        built.push({
          type: "function",
          function: {
            name,
            description: t.description.trim() || undefined,
            ...(Object.keys(params).length ? { parameters: params } : {}),
          },
        });
      }
      if (built.length) overrides.tools = built;
    }

    const bodyOverridesPreview = sanitizeReplayBodyOverrides(requestBodyOverrides);
    const mergedOverrides = { ...overrides, ...bodyOverridesPreview };
    if (Object.keys(mergedOverrides).length) {
      preview.replay_overrides = mergedOverrides;
    }

    const perBySnap: Record<string, Record<string, unknown>> = {};
    for (const sid of selectedSnapshotIdsForRun) {
      const s = sanitizeReplayBodyOverrides(requestBodyOverridesBySnapshotId[sid]);
      if (Object.keys(s).length) perBySnap[sid] = s;
    }
    if (Object.keys(perBySnap).length) {
      preview.replay_overrides_by_snapshot_id = perBySnap;
    }

    preview.tool_context = buildToolContextPayload(
      toolContextMode,
      toolContextScope,
      toolContextGlobalText,
      toolContextBySnapshotId
    );

    return preview;
  }, [
    modelOverrideEnabled,
    newModel,
    replayProvider,
    requestBody,
    requestSystemPrompt,
    toolsList,
    toolContextMode,
    toolContextScope,
    toolContextGlobalText,
    toolContextBySnapshotId,
    requestBodyOverrides,
    selectedSnapshotIdsForRun,
    requestBodyOverridesBySnapshotId,
  ]);

  const handleBodyOverridesJsonBlur = useCallback(() => {
    const raw = bodyOverridesJsonDraft ?? requestBodyOverridesJson;
    const trimmed = raw.trim();
    if (!trimmed) {
      setRequestBodyOverrides({});
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setBodyOverridesJsonError("Must be a JSON object.");
        return;
      }
      setRequestBodyOverrides(sanitizeReplayBodyOverrides(parsed as Record<string, unknown>));
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
    } catch {
      setBodyOverridesJsonError("Invalid JSON.");
    }
  }, [bodyOverridesJsonDraft, requestBodyOverridesJson]);

  const clearBodyOverrides = useCallback(() => {
    setRequestBodyOverrides({});
    setBodyOverridesJsonDraft(null);
    setBodyOverridesJsonError("");
    setRequestBodyOverridesBySnapshotId({});
    setBodyOverridesSnapshotDraftRaw({});
    setBodyOverridesSnapshotJsonError({});
  }, []);

  const handleBodyOverridesSnapshotBlur = useCallback(
    (sid: string) => {
      const raw =
        bodyOverridesSnapshotDraftRaw[sid] ??
        JSON.stringify(requestBodyOverridesBySnapshotId[sid] ?? {}, null, 2);
      const trimmed = raw.trim();
      if (!trimmed) {
        setRequestBodyOverridesBySnapshotId(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        setBodyOverridesSnapshotDraftRaw(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        setBodyOverridesSnapshotJsonError(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setBodyOverridesSnapshotJsonError(prev => ({ ...prev, [sid]: "Must be a JSON object." }));
          return;
        }
        setRequestBodyOverridesBySnapshotId(prev => ({
          ...prev,
          [sid]: sanitizeReplayBodyOverrides(parsed as Record<string, unknown>),
        }));
        setBodyOverridesSnapshotDraftRaw(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        setBodyOverridesSnapshotJsonError(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
      } catch {
        setBodyOverridesSnapshotJsonError(prev => ({ ...prev, [sid]: "Invalid JSON." }));
      }
    },
    [bodyOverridesSnapshotDraftRaw, requestBodyOverridesBySnapshotId]
  );

  const applyLoadedGlobalBodyOverrides = useCallback((obj: Record<string, unknown>) => {
    setRequestBodyOverrides(sanitizeReplayBodyOverrides(obj));
    setBodyOverridesJsonDraft(null);
    setBodyOverridesJsonError("");
  }, []);

  const applyLoadedSnapshotBodyOverrides = useCallback((sid: string, obj: Record<string, unknown>) => {
    const cleaned = sanitizeReplayBodyOverrides(obj);
    setRequestBodyOverridesBySnapshotId(prev => ({ ...prev, [sid]: cleaned }));
    setBodyOverridesSnapshotDraftRaw(prev => ({ ...prev, [sid]: JSON.stringify(cleaned, null, 2) }));
    setBodyOverridesSnapshotJsonError(prev => {
      const n = { ...prev };
      delete n[sid];
      return n;
    });
  }, []);

  const handleRequestJsonBlur = useCallback(() => {
    const raw = requestJsonDraft ?? requestBodyJson;
    const trimmed = raw.trim();
    if (!trimmed) {
      const next =
        Array.isArray(requestBody.tools) && requestBody.tools.length > 0
          ? { tools: requestBody.tools }
          : {};
      setRequestBody(next);
      setRequestJsonDraft(null);
      setRequestJsonError("");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRequestJsonError("Must be a JSON object.");
        return;
      }
      const obj = parsed as Record<string, unknown>;
      // Keep JSON editor focused on configuration-only fields.
      delete obj.model;
      delete (obj as any).system_prompt;
      delete (obj as any).messages;
      delete (obj as any).message;
      delete (obj as any).user_message;
      delete (obj as any).response;
      delete (obj as any).responses;
      delete (obj as any).input;
      delete (obj as any).inputs;
      delete (obj as any).trace_id;
      delete (obj as any).agent_id;
      delete (obj as any).agent_name;
      if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
        obj.tools = requestBody.tools;
      }
      setRequestBody(obj);
      setRequestJsonDraft(null);
      setRequestJsonError("");
    } catch {
      setRequestJsonError("Invalid JSON.");
    }
  }, [requestBody, requestBodyJson, requestJsonDraft]);

  const handleResetRequestJson = useCallback(() => {
    if (!baselinePayload) return;
    setRequestBody(payloadWithoutModel(baselinePayload));
    setRequestJsonDraft(null);
    setRequestJsonError("");
  }, [baselinePayload]);

  useEffect(() => {
    if (toolsList.length === 0) {
      setRequestBody(prev => {
        const next = { ...prev };
        delete next.tools;
        return next;
      });
      return;
    }
    const built: Array<Record<string, unknown>> = [];
    for (const t of toolsList) {
      const name = t.name.trim();
      if (!name) continue;
      let params: Record<string, unknown> = {};
      if (t.parameters.trim()) {
        try {
          const p = JSON.parse(t.parameters.trim());
          if (p && typeof p === "object") params = p as Record<string, unknown>;
        } catch {
          continue;
        }
      }
      built.push({
        type: "function",
        function: {
          name,
          description: t.description.trim() || undefined,
          ...(Object.keys(params).length ? { parameters: params } : {}),
        },
      });
    }
    if (built.length) setRequestBody(prev => ({ ...prev, tools: built }));
  }, [toolsList]);

  useEffect(() => {
    const selectionKey = `${selectedSnapshotIdsForRun.join(",")}|rep:${effectiveRepresentativeBaselineSnapshotId ?? ""}`;
    if (!selectedSnapshotIdsForRun.length) return;
    if (!baselineSeedSnapshot || !baselinePayload) return;

    if (selectionKey !== toolsHydratedKey) {
      setToolsList(baselineTools);
      setToolsHydratedKey(selectionKey);
    }

    if (selectionKey !== overridesHydratedKey) {
      setRequestBody(payloadWithoutModel(baselinePayload));
      if (!modelOverrideEnabled) {
        setNewModel(runDataModel);
        const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
        if (inferredProvider) {
          setReplayProvider(inferredProvider);
          setModelProviderTab(inferredProvider);
        }
      }
      setRequestJsonError("");
      setOverridesHydratedKey(selectionKey);
    }
  }, [
    selectedSnapshotIdsForRun,
    effectiveRepresentativeBaselineSnapshotId,
    baselineSeedSnapshot,
    baselinePayload,
    baselineTools,
    runDataModel,
    runDataProvider,
    modelOverrideEnabled,
    toolsHydratedKey,
    overridesHydratedKey,
  ]);

  useEffect(() => {
    if (modelOverrideEnabled) return;
    if (runDataModel) setNewModel(runDataModel);
    const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
    if (!inferredProvider) return;
    setReplayProvider(inferredProvider);
    setModelProviderTab(inferredProvider);
  }, [modelOverrideEnabled, runDataProvider, runDataModel]);

  // Keep provider selection user-driven while overriding.
  // We validate mismatch at run time and show a clear error instead of silently changing tabs/providers.

  const onAgentSelect = useCallback((agent: AgentForPicker) => {
    setAgentId(agent.agent_id);
    setSelectedAgent(agent);
    setDatasetIds([]); // Reset datasets on agent change
    clearBodyOverrides();
    setViewMode("expanded");
  }, [clearBodyOverrides]);

  const onMapSelectAgent = useCallback(
    (selectedId: string) => {
      const agent = agents.find(a => a.agent_id === selectedId);
      if (agent) onAgentSelect(agent);
    },
    [agents, onAgentSelect]
  );

  const agentsErrorStatus = Number((agentsError as any)?.response?.status ?? 0);
  const agentsErrorCode = getApiErrorCode(agentsError);
  const showGateLoadingState = agentsLoading && typeof agentsData === "undefined";
  const showGateAccessDeniedState = !!agentsError && agentsErrorStatus === 403;
  const showGateApiErrorState =
    !!agentsError && agentsErrorStatus !== 401 && !showGateAccessDeniedState;
  const showGateEmptyState = false;

  useEffect(() => {
    if (agentsErrorStatus !== 401) return;
    redirectToLogin({
      code: agentsErrorCode,
      message: getApiErrorMessage(agentsError),
    });
  }, [agentsError, agentsErrorCode, agentsErrorStatus]);

  const contextValue = useMemo<ReleaseGatePageContextValue>(
    () => ({
      orgId,
      projectId,
      project,
      tab,
      setTab,
      setViewMode,
      setAgentId,
      setSelectedAgent,
      setDatasetIds,
      setSnapshotIds,
      setRunSnapshotIds,
      setRunDatasetIds,
      dataSource,
      setExpandedDatasetId,
      selectedAgent,
      agentsLoaded,
      agents,
      onMapSelectAgent,
      requestSystemPrompt,
      recentSnapshots,
      recentSnapshotsTotalAvailable,
      recentSnapshotsLoading,
      recentSnapshotsError,
      mutateRecentSnapshots,
      baselineSnapshotsById,
      runSnapshotIds,
      setDataSource,
      snapshotEvalFailed,
      setBaselineDetailSnapshot,
      openBaselineDetailSnapshot,
      datasets,
      datasetsLoading,
      datasetsError,
      mutateDatasets,
      runDatasetIds,
      expandedDatasetId,
      expandedDatasetSnapshots,
      datasetSnapshotsLoading,
      datasetSnapshotsError,
      datasetSnapshots404,
      mutateDatasetSnapshots,
      expandedDatasetSnapshotsLoading,
      expandedDatasetSnapshotsError,
      expandedDatasetSnapshots404,
      mutateExpandedDatasetSnapshots,
      baselineSeedSnapshot,
      baselinePayload,
      nodeBasePayload,
      finalCandidateRequest,
      baselineConfigSummary,
      validateOverridePreview,
      configSourceLabel,
      representativeBaselineUserSnapshotId,
      setRepresentativeBaselineUserSnapshotId,
      effectiveRepresentativeBaselineSnapshotId,
      autoRepresentativeBaselineSnapshotId,
      representativeBaselinePickerOptions,
      selectedBaselineCount,
      selectedDataSummary,
      REPLAY_PROVIDER_MODEL_LIBRARY: replayProviderModelLibrary,
      REPLAY_THRESHOLD_PRESETS,
      thresholdPreset,
      setThresholdPreset,
      normalizeGateThresholds,
      failRateMax,
      setFailRateMax,
      flakyRateMax,
      setFlakyRateMax,
      newModel,
      setNewModel,
      modelOverrideEnabled,
      setModelOverrideEnabled,
      replayProvider,
      setReplayProvider,
      requestBody,
      setRequestBody,
      requestBodyJson,
      requestJsonDraft,
      setRequestJsonDraft,
      requestJsonError,
      requestBodyOverrides,
      setRequestBodyOverrides,
      requestBodyOverridesJson,
      bodyOverridesJsonDraft,
      setBodyOverridesJsonDraft,
      bodyOverridesJsonError,
      setBodyOverridesJsonError,
      requestBodyOverridesBySnapshotId,
      bodyOverridesSnapshotDraftRaw,
      setBodyOverridesSnapshotDraftRaw,
      bodyOverridesSnapshotJsonError,
      setBodyOverridesSnapshotJsonError,
      handleBodyOverridesJsonBlur,
      handleBodyOverridesSnapshotBlur,
      applyLoadedGlobalBodyOverrides,
      applyLoadedSnapshotBodyOverrides,
      clearBodyOverrides,
      handleRequestJsonBlur,
      applySystemPromptToBody,
      toolsList,
      setToolsList,
      toolContextMode,
      setToolContextMode,
      toolContextScope,
      setToolContextScope,
      toolContextGlobalText,
      setToolContextGlobalText,
      toolContextBySnapshotId,
      setToolContextBySnapshotId,
      toolContextLoadBusy,
      handleLoadToolContextFromSnapshots,
      selectedSnapshotIdsForRun,
      repeatRuns,
      setRepeatRuns,
      repeatDropdownOpen,
      setRepeatDropdownOpen,
      repeatDropdownRef,
      REPEAT_OPTIONS: RELEASE_GATE_REPEAT_OPTIONS,
      isHeavyRepeat,
      canRunValidate,
      keyBlocked,
      keyRegistrationMessage,
      isValidating,
      activeJobId,
      cancelRequested,
      handleValidate,
      handleCancelActiveJob,
      error,
      result,
      expandedCaseIndex,
      setExpandedCaseIndex,
      selectedAttempt,
      setSelectedAttempt,
      baselineDetailSnapshot,
      agentEvalData,
      runEvalElements,
      historyStatus,
      setHistoryStatus,
      historyTraceId,
      setHistoryTraceId,
      historyDatePreset,
      setHistoryDatePreset,
      historyOffset,
      setHistoryOffset,
      historyLimit,
      historyLoading,
      historyRefreshing,
      historyItems,
      historyTotal,
      mutateHistory,
      selectedRunId,
      setSelectedRunId,
      selectedRunReport,
      selectedRunReportLoading,
      selectedRunReportError,
      expandedHistoryId,
      setExpandedHistoryId,
      runDataProvider,
      runDataModel,
      runDataPrompt,
    }),
    [
      activeJobId,
      agentEvalData,
      agents,
      agentsLoaded,
      applyLoadedGlobalBodyOverrides,
      applyLoadedSnapshotBodyOverrides,
      autoRepresentativeBaselineSnapshotId,
      baselineConfigSummary,
      baselineDetailSnapshot,
      baselinePayload,
      baselineSeedSnapshot,
      baselineSnapshotsById,
      bodyOverridesJsonDraft,
      bodyOverridesJsonError,
      bodyOverridesSnapshotDraftRaw,
      bodyOverridesSnapshotJsonError,
      cancelRequested,
      canRunValidate,
      clearBodyOverrides,
      configSourceLabel,
      dataSource,
      datasetSnapshots404,
      datasetSnapshotsError,
      datasetSnapshotsLoading,
      datasets,
      datasetsError,
      datasetsLoading,
      effectiveRepresentativeBaselineSnapshotId,
      error,
      expandedCaseIndex,
      expandedDatasetId,
      expandedDatasetSnapshots,
      expandedDatasetSnapshots404,
      expandedDatasetSnapshotsError,
      expandedDatasetSnapshotsLoading,
      expandedHistoryId,
      failRateMax,
      finalCandidateRequest,
      flakyRateMax,
      handleBodyOverridesJsonBlur,
      handleBodyOverridesSnapshotBlur,
      handleCancelActiveJob,
      handleLoadToolContextFromSnapshots,
      handleRequestJsonBlur,
      handleValidate,
      historyDatePreset,
      historyItems,
      historyLimit,
      historyLoading,
      historyOffset,
      historyRefreshing,
      historyStatus,
      setHistoryDatePreset,
      setHistoryOffset,
      setHistoryStatus,
      setHistoryTraceId,
      historyTotal,
      historyTraceId,
      isHeavyRepeat,
      isValidating,
      keyBlocked,
      keyRegistrationMessage,
      modelOverrideEnabled,
      mutateDatasetSnapshots,
      mutateDatasets,
      mutateExpandedDatasetSnapshots,
      mutateHistory,
      mutateRecentSnapshots,
      newModel,
      nodeBasePayload,
      onMapSelectAgent,
      openBaselineDetailSnapshot,
      orgId,
      project,
      projectId,
      recentSnapshots,
      recentSnapshotsError,
      recentSnapshotsLoading,
      recentSnapshotsTotalAvailable,
      repeatDropdownOpen,
      repeatRuns,
      replayProvider,
      replayProviderModelLibrary,
      representativeBaselinePickerOptions,
      representativeBaselineUserSnapshotId,
      requestBody,
      requestBodyJson,
      requestBodyOverrides,
      requestBodyOverridesBySnapshotId,
      requestBodyOverridesJson,
      requestJsonDraft,
      requestJsonError,
      requestSystemPrompt,
      result,
      runDataModel,
      runDataPrompt,
      runDataProvider,
      runDatasetIds,
      runEvalElements,
      runSnapshotIds,
      selectedAgent,
      selectedAttempt,
      selectedBaselineCount,
      selectedDataSummary,
      selectedRunId,
      selectedRunReport,
      selectedRunReportError,
      selectedRunReportLoading,
      selectedSnapshotIdsForRun,
      tab,
      thresholdPreset,
      toolContextBySnapshotId,
      toolContextGlobalText,
      toolContextLoadBusy,
      toolContextMode,
      toolContextScope,
      toolsList,
      validateOverridePreview,
    ]
  );
  const liveViewHref = useMemo(
    () =>
      orgId && projectId && !isNaN(projectId)
        ? `/organizations/${encodeURIComponent(orgId)}/projects/${projectId}/live-view`
        : "/organizations",
    [orgId, projectId]
  );

  const gateBodyProps = useMemo(
    (): ReleaseGateLayoutGateBodyProps => ({
      showGateLoadingState,
      showGateAccessDeniedState,
      showGateApiErrorState,
      showGateEmptyState,
      viewMode,
      mutateAgents,
      liveViewHref,
      agents,
      agentsLoaded,
      onSelectAgent: onMapSelectAgent,
      projectName: project?.name,
    }),
    [
      showGateLoadingState,
      showGateAccessDeniedState,
      showGateApiErrorState,
      showGateEmptyState,
      viewMode,
      mutateAgents,
      liveViewHref,
      agents,
      agentsLoaded,
      onMapSelectAgent,
      project?.name,
    ]
  );

  const rawLayoutChildren = React.createElement(ReleaseGateLayoutGateBody, gateBodyProps);
  const layoutChildren = React.createElement(
    ReleaseGatePlanLimitedScaffold,
    { planError },
    rawLayoutChildren
  );

  const handleLayoutHudAction = useCallback((actionId: string) => {
    console.log("Release Gate HUD Action:", actionId);
  }, []);

  return React.createElement(
    ReleaseGatePageContext.Provider,
    { value: contextValue },
    React.createElement(
      ReleaseGateLayoutWrapper,
      {
        orgId,
        projectId,
        projectName: project?.name,
        orgName: org?.name,
        onAction: handleLayoutHudAction,
      },
      layoutChildren
    )
  );
}
