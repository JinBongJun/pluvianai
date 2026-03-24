"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";

import {
  ReleaseGateLayoutGateBody,
  type ReleaseGateLayoutGateBodyProps,
} from "./ReleaseGateLayoutGateBody";
import { ReleaseGateLayoutWrapper } from "./ReleaseGateLayoutWrapper";
import { ReleaseGatePlanLimitedScaffold } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePlanLimitedScaffold";
import { ReleaseGateKeysContext } from "./ReleaseGateKeysContext";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import {
  ReleaseGateValidateRunContext,
  type ReleaseGateValidateRunContextValue,
} from "./ReleaseGateValidateRunContext";
import { useReleaseGatePageContextValue } from "./useReleaseGatePageContextValue";
import type { SnapshotForDetail } from "@/components/shared/SnapshotDetailModal";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { orgKeys } from "@/lib/queryKeys";
import {
  behaviorAPI,
  liveViewAPI,
  organizationsAPI,
  projectsAPI,
  releaseGateAPI,
} from "@/lib/api";
import { useReleaseGateBaselineSnapshots } from "./useReleaseGateBaselineSnapshots";
import { useReleaseGateBaselineHydration } from "./useReleaseGateBaselineHydration";
import { useReleaseGateBehaviorDatasets } from "./useReleaseGateBehaviorDatasets";
import { useReleaseGateNodeDefaultConfigSeed } from "./useReleaseGateNodeDefaultConfigSeed";
import { useReleaseGateProjectApiKeys } from "./useReleaseGateProjectApiKeys";
import { useReleaseGateAgentLifecycle } from "./useReleaseGateAgentLifecycle";
import { useReleaseGateAgentSelection } from "./useReleaseGateAgentSelection";
import { useDismissOnDocumentClickOutside } from "./useDismissOnDocumentClickOutside";
import { useReleaseGateClearRunPanelsOnNewReport } from "./useReleaseGateClearRunPanelsOnNewReport";
import { useReleaseGateRunSelectionMirror } from "./useReleaseGateRunSelectionMirror";
import { useReleaseGateSelectedSnapshotsSideEffects } from "./useReleaseGateSelectedSnapshotsSideEffects";
import { useReleaseGateToolsAndModelSync } from "./useReleaseGateToolsAndModelSync";
import { useReleaseGateReplayJsonHandlers } from "./useReleaseGateReplayJsonHandlers";
import { useReleaseGateHistory } from "./useReleaseGateHistory";
import { useReleaseGateAgents } from "./useReleaseGateAgents";
import {
  createDefaultValidateRunDeps,
  useReleaseGateValidateRun,
  useReleaseGateValidateRunDepsRefSync,
} from "./useReleaseGateValidateRun";
import type { EditableTool, ReplayProvider } from "./releaseGatePageContent.lib";
import type { GateTab, ThresholdPreset } from "./releaseGateExpandedHelpers";
import {
  buildRunEvalElementsFromAgentEval,
  buildValidateOverridePreview,
  DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY,
  editableRequestBodyWithoutTools,
  EMPTY_SWF_ITEMS,
  extractSystemPromptFromPayload,
  extractToolResultTextFromSnapshotRecord,
  extractToolsFromPayload,
  asPayloadObject,
  buildBaselineConfigSummary,
  buildFinalCandidateRequest,
  getRequestPart,
  inferProviderFromModelId,
  normalizeReplayProvider,
  parseSnapshotCreatedAtMs,
  PROVIDER_PAYLOAD_TEMPLATES,
  REPLAY_THRESHOLD_PRESETS,
} from "./releaseGatePageContent.lib";

export { sanitizePayloadForPreview } from "./releaseGatePageContent.lib";

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
  const isHeavyRepeat = repeatRuns === 50 || repeatRuns === 100;
  useDismissOnDocumentClickOutside(repeatDropdownOpen, repeatDropdownRef, setRepeatDropdownOpen);
  const [thresholdPreset, setThresholdPreset] = useState<ThresholdPreset>("default");
  const [failRateMax, setFailRateMax] = useState<number>(
    REPLAY_THRESHOLD_PRESETS.default.failRateMax
  );
  const [flakyRateMax, setFlakyRateMax] = useState<number>(
    REPLAY_THRESHOLD_PRESETS.default.flakyRateMax
  );

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
    runValidateCooldownUntilMs,
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
  useReleaseGateAgentLifecycle({
    agentIdFromUrl,
    agentId,
    clearRunUi,
    setAgentId,
    setViewMode,
    setRequestBody,
    setRequestJsonDraft,
    setRequestJsonError,
    setToolsList,
    setToolContextMode,
    setToolContextScope,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    setToolContextLoadBusy,
    setRepresentativeBaselineUserSnapshotId,
  });

  useReleaseGateClearRunPanelsOnNewReport(
    result?.report_id,
    setSelectedRunResultIndex,
    setExpandedCaseIndex,
    setSelectedAttempt
  );

  const {
    agentsData,
    agentsLoading,
    agentsError,
    mutateAgents,
    agentsLoaded,
    agents,
  } = useReleaseGateAgents({ projectId, runLocked });

  useReleaseGateRunSelectionMirror({
    datasetIds,
    snapshotIds,
    setRunDatasetIds,
    setRunSnapshotIds,
  });

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

  useReleaseGateSelectedSnapshotsSideEffects({
    selectedSnapshotIdsForRun,
    agentId,
    representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId,
    setToolContextBySnapshotId,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
  });

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

  const {
    overridesHydratedKey,
    setOverridesHydratedKey,
    resetParitySharedOverridesToBaseline,
    resetParityPerLogOverridesToBaseline,
    resetParityToolsToBaseline,
    resetParityToolContextToBaseline,
  } = useReleaseGateBaselineHydration({
    agentId,
    selectedSnapshotIdsForRun,
    effectiveRepresentativeBaselineSnapshotId,
    baselineSeedSnapshot,
    baselinePayload,
    baselineSnapshotsById,
    baselineTools,
    runDataModel,
    runDataProvider,
    modelOverrideEnabled,
    setToolsList,
    setRequestBody,
    setNewModel,
    setReplayProvider,
    setModelProviderTab,
    setRequestJsonError,
    setRequestBodyOverrides,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setToolContextBySnapshotId,
  });

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

  useReleaseGateNodeDefaultConfigSeed({
    agentId,
    selectedSnapshotIdsForRun,
    baselineSeedSnapshot,
    baselinePayload,
    liveNodeLatestPayload,
    requestBody,
    toolsList,
    runDataProvider,
    runDataModel,
    overridesHydratedKey,
    setOverridesHydratedKey,
    setRequestBody,
    setToolsList,
  });

  const effectiveProvider = modelOverrideEnabled ? replayProvider : runDataProvider;
  const effectiveModel = modelOverrideEnabled ? newModel.trim() : runDataModel;

  const canValidate =
    !!agentId?.trim() &&
    ((dataSource === "recent" && runSnapshotIds.length > 0) ||
      (dataSource === "datasets" && runDatasetIds.length > 0));

  const { keyBlocked, keyRegistrationMessage } = useReleaseGateProjectApiKeys({
    projectId,
    runLocked,
    canValidate,
    modelOverrideEnabled,
    replayProvider,
    baselineSnapshotsForRun,
    runDataProvider,
    agentId,
  });

  const modelOverrideInvalid = modelOverrideEnabled && !newModel.trim();
  const runBlockedMessage = modelOverrideInvalid
    ? "Run blocked: select a model id for override or switch back to detected model."
    : keyRegistrationMessage;

  const runValidateCooldownActive = runValidateCooldownUntilMs > Date.now();
  const canRunValidate =
    canValidate && !keyBlocked && !modelOverrideInvalid && !runValidateCooldownActive;

  const runEvalElements = useMemo(
    () => buildRunEvalElementsFromAgentEval(agentEvalData),
    [agentEvalData]
  );

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

  useReleaseGateValidateRunDepsRefSync(validateRunDepsRef, {
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
  });

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

  const {
    handleBodyOverridesJsonBlur,
    clearBodyOverrides,
    handleBodyOverridesSnapshotBlur,
    applyLoadedGlobalBodyOverrides,
    applyLoadedSnapshotBodyOverrides,
    handleRequestJsonBlur,
    handleResetRequestJson,
  } = useReleaseGateReplayJsonHandlers({
    bodyOverridesJsonDraft,
    requestBodyOverridesJson,
    bodyOverridesSnapshotDraftRaw,
    requestBodyOverridesBySnapshotId,
    requestJsonDraft,
    requestBodyJson,
    requestBody,
    baselinePayload,
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setRequestBody,
    setRequestJsonDraft,
    setRequestJsonError,
  });

  const {
    onMapSelectAgent,
    showGateLoadingState,
    showGateAccessDeniedState,
    showGateApiErrorState,
    showGateEmptyState,
  } = useReleaseGateAgentSelection({
    agentId,
    agents,
    agentsData,
    agentsLoading,
    agentsError,
    clearBodyOverrides,
    setAgentId,
    setSelectedAgent,
    setDatasetIds,
    setViewMode,
  });

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

  const validateOverridePreview = useMemo(
    () =>
      buildValidateOverridePreview({
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
      }),
    [
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
    ]
  );

  useReleaseGateToolsAndModelSync({
    toolsList,
    setRequestBody,
    modelOverrideEnabled,
    runDataModel,
    runDataProvider,
    setNewModel,
    setReplayProvider,
    setModelProviderTab,
  });

  // Keep provider selection user-driven while overriding.
  // We validate mismatch at run time and show a clear error instead of silently changing tabs/providers.

  const contextValue = useReleaseGatePageContextValue({
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
    thresholdPreset,
    setThresholdPreset,
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
    resetParitySharedOverridesToBaseline,
    resetParityPerLogOverridesToBaseline,
    resetParityToolsToBaseline,
    resetParityToolContextToBaseline,
    handleRequestJsonBlur,
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
    isHeavyRepeat,
    canRunValidate,
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
  });

  const validateRunContextValue = useMemo<ReleaseGateValidateRunContextValue>(
    () => ({
      isValidating,
      activeJobId,
      cancelRequested,
      handleValidate,
      handleCancelActiveJob,
      error,
      result,
    }),
    [
      activeJobId,
      cancelRequested,
      error,
      handleCancelActiveJob,
      handleValidate,
      isValidating,
      result,
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

  const releaseGateKeysContextValue = useMemo(
    () => ({ keyBlocked, keyRegistrationMessage }),
    [keyBlocked, keyRegistrationMessage]
  );

  const rawLayoutChildren = React.createElement(ReleaseGateLayoutGateBody, gateBodyProps);
  const layoutChildren = React.createElement(
    ReleaseGatePlanLimitedScaffold,
    { planError },
    rawLayoutChildren
  );

  const handleLayoutHudAction = useCallback((_actionId: string) => {}, []);

  return React.createElement(
    ReleaseGateValidateRunContext.Provider,
    { value: validateRunContextValue },
    React.createElement(
      ReleaseGateKeysContext.Provider,
      { value: releaseGateKeysContextValue },
      React.createElement(
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
      )
    )
  );
}
