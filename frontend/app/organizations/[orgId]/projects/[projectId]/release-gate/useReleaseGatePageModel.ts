"use client";

import { useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";

import type { ReleaseGateLayoutGateBodyProps } from "./ReleaseGateLayoutGateBody";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import type { ReleaseGateValidateRunContextValue } from "./ReleaseGateValidateRunContext";
import type { PlanLimitError } from "@/lib/planErrors";
import { useReleaseGatePageModelReturn } from "./useReleaseGatePageModelReturn";
import { useReleaseGatePageContextValue } from "./useReleaseGatePageContextValue";
import { useReleaseGatePageContextParams } from "./useReleaseGatePageContextParams";
import type { ReleaseGatePageContextRestSlice } from "./releaseGatePageContextParams";
import { useReleaseGateBaselineSnapshots } from "./useReleaseGateBaselineSnapshots";
import { useReleaseGateBaselineDetailSnapshot } from "./useReleaseGateBaselineDetailSnapshot";
import { useReleaseGateBaselineHydration } from "./useReleaseGateBaselineHydration";
import { useReleaseGateBehaviorDatasets } from "./useReleaseGateBehaviorDatasets";
import { useReleaseGateNodeDefaultConfigSeed } from "./useReleaseGateNodeDefaultConfigSeed";
import { useReleaseGateProjectApiKeys } from "./useReleaseGateProjectApiKeys";
import { useReleaseGateAgentLifecycle } from "./useReleaseGateAgentLifecycle";
import { useReleaseGateAgentSelection } from "./useReleaseGateAgentSelection";
import { useReleaseGateClearRunPanelsOnNewReport } from "./useReleaseGateClearRunPanelsOnNewReport";
import { useReleaseGateRunSelectionMirror } from "./useReleaseGateRunSelectionMirror";
import { useReleaseGateSelectedSnapshotsSideEffects } from "./useReleaseGateSelectedSnapshotsSideEffects";
import { useReleaseGateToolsAndModelSync } from "./useReleaseGateToolsAndModelSync";
import { useReleaseGateReplayJsonHandlers } from "./useReleaseGateReplayJsonHandlers";
import { useReleaseGateHistory } from "./useReleaseGateHistory";
import { useReleaseGateAgents } from "./useReleaseGateAgents";
import { useReleaseGateValidateRunDepsRefSync } from "./useReleaseGateValidateRun";
import { useReleaseGatePageBootstrap } from "./useReleaseGatePageBootstrap";
import { useReleaseGateValidateBridge } from "./useReleaseGateValidateBridge";
import { useReleaseGatePageLocalState } from "./useReleaseGatePageLocalState";
import { useReleaseGateRunDataDerivations } from "./useReleaseGateRunDataDerivations";
import { useReleaseGateToolContextLoader } from "./useReleaseGateToolContextLoader";
import {
  buildBaselineConfigSummary,
  buildFinalCandidateRequest,
  buildValidateOverridePreview,
  editableRequestBodyWithoutTools,
  extractSystemPromptFromPayload,
} from "./releaseGatePageContent.lib";

export type ReleaseGatePageModel = {
  validateRunContextValue: ReleaseGateValidateRunContextValue;
  releaseGateKeysContextValue: { keyBlocked: boolean; keyRegistrationMessage: string };
  contextValue: ReleaseGatePageContextValue;
  gateBodyProps: ReleaseGateLayoutGateBodyProps;
  planError: PlanLimitError | null;
  layout: {
    orgId: string;
    projectId: number;
    projectName?: string;
    orgName?: string;
    onAction: (actionId: string) => void;
  };
};

/**
 * Release Gate orchestration hook (former `ReleaseGatePageContent` body).
 *
 * **Composition**  
 * §1 `useReleaseGatePageBootstrap` + `useReleaseGateValidateBridge`  
 * §2 `useReleaseGatePageLocalState`  
 * §3 `useReleaseGateHistory` + URL agent lifecycle + agents + datasets  
 * §4 `useReleaseGateBaselineSnapshots` + tool-context loader + `useReleaseGateRunDataDerivations`  
 * §5 Hydration, API keys, validate deps, JSON handlers, selection, previews  
 * §6 `useReleaseGatePageContextParams` → `useReleaseGatePageContextValue` + layout return
 *
 * Render: {@link ReleaseGatePageContent}.
 */
export function useReleaseGatePageModel(): ReleaseGatePageModel {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const orgId = params?.orgId as string;
  const rawProjectId = params?.projectId;
  const projectIdStr = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId;
  const projectId = projectIdStr ? Number(projectIdStr) : 0;

  const { project, org } = useReleaseGatePageBootstrap(orgId, projectId, href =>
    router.replace(href)
  );
  const {
    mutateHistoryRef,
    validateRunDepsRef,
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
  } = useReleaseGateValidateBridge(projectId);

  const lv = useReleaseGatePageLocalState();
  const {
    tab,
    setTab,
    viewMode,
    setViewMode,
    repeatRuns,
    setRepeatRuns,
    repeatDropdownOpen,
    setRepeatDropdownOpen,
    repeatDropdownRef,
    isHeavyRepeat,
    thresholdPreset,
    setThresholdPreset,
    failRateMax,
    setFailRateMax,
    flakyRateMax,
    setFlakyRateMax,
    agentId,
    setAgentId,
    selectedAgent,
    setSelectedAgent,
    datasetIds,
    setDatasetIds,
    dataSource,
    setDataSource,
    snapshotIds,
    setSnapshotIds,
    newModel,
    setNewModel,
    replayProvider,
    setReplayProvider,
    modelOverrideEnabled,
    setModelOverrideEnabled,
    setModelProviderTab,
    requestBody,
    setRequestBody,
    requestJsonDraft,
    setRequestJsonDraft,
    requestJsonError,
    setRequestJsonError,
    requestBodyOverrides,
    setRequestBodyOverrides,
    bodyOverridesJsonDraft,
    setBodyOverridesJsonDraft,
    bodyOverridesJsonError,
    setBodyOverridesJsonError,
    requestBodyOverridesBySnapshotId,
    setRequestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotDraftRaw,
    bodyOverridesSnapshotJsonError,
    setBodyOverridesSnapshotJsonError,
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
    setToolContextLoadBusy,
    representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId,
    runDatasetIds,
    setRunDatasetIds,
    runSnapshotIds,
    setRunSnapshotIds,
    expandedDatasetId,
    setExpandedDatasetId,
    selectedRunResultIndex,
    setSelectedRunResultIndex,
    expandedCaseIndex,
    setExpandedCaseIndex,
    selectedAttempt,
    setSelectedAttempt,
    expandedHistoryId,
    setExpandedHistoryId,
    selectedRunId,
    setSelectedRunId,
  } = lv;

  const {
    baselineDetailSnapshot,
    setBaselineDetailSnapshot,
    openBaselineDetailSnapshot,
  } = useReleaseGateBaselineDetailSnapshot(projectId);

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

  const { handleLoadToolContextFromSnapshots } = useReleaseGateToolContextLoader({
    projectId,
    selectedSnapshotIdsForRun,
    toolContextScope,
    effectiveRepresentativeBaselineSnapshotId,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    setToolContextLoadBusy,
  });

  const rd = useReleaseGateRunDataDerivations({
    projectId,
    agentId,
    selectedRunId,
    runLocked,
    baselineSeedSnapshot,
    runSnapshotIds,
    runDatasetIds,
  });
  const { liveNodeLatestPayload, baselinePayload, baselineTools, runDataModel, runDataProvider, runDataPrompt, nodeBasePayload } =
    rd;

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
  const runValidateCooldownActive = runValidateCooldownUntilMs > Date.now();
  const canRunValidate =
    canValidate && !keyBlocked && !modelOverrideInvalid && !runValidateCooldownActive;

  const requestSystemPrompt = useMemo(() => {
    const fromBody =
      typeof requestBody.system_prompt === "string"
        ? requestBody.system_prompt
        : extractSystemPromptFromPayload(requestBody);
    if (fromBody && fromBody.trim()) {
      return fromBody.trim();
    }
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

  const pageContextRest = useMemo(
    (): ReleaseGatePageContextRestSlice => ({
      orgId,
      projectId,
      project,
      agents,
      agentsLoaded,
      onMapSelectAgent,
      requestSystemPrompt,
      requestBodyJson,
      requestBodyOverridesJson,
      recentSnapshots,
      recentSnapshotsTotalAvailable,
      recentSnapshotsLoading,
      recentSnapshotsError,
      mutateRecentSnapshots,
      baselineSnapshotsById,
      setBaselineDetailSnapshot,
      openBaselineDetailSnapshot,
      baselineDetailSnapshot,
      datasets,
      datasetsLoading,
      datasetsError,
      mutateDatasets,
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
      finalCandidateRequest,
      baselineConfigSummary,
      validateOverridePreview,
      representativeBaselineUserSnapshotId,
      setRepresentativeBaselineUserSnapshotId,
      effectiveRepresentativeBaselineSnapshotId,
      autoRepresentativeBaselineSnapshotId,
      representativeBaselinePickerOptions,
      selectedBaselineCount,
      selectedDataSummary,
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
      handleLoadToolContextFromSnapshots,
      selectedSnapshotIdsForRun,
      canRunValidate,
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
    }),
    [
      lv,
      rd,
      orgId,
      projectId,
      project,
      agents,
      agentsLoaded,
      onMapSelectAgent,
      requestSystemPrompt,
      requestBodyJson,
      requestBodyOverridesJson,
      recentSnapshots,
      recentSnapshotsTotalAvailable,
      recentSnapshotsLoading,
      recentSnapshotsError,
      mutateRecentSnapshots,
      baselineSnapshotsById,
      setBaselineDetailSnapshot,
      openBaselineDetailSnapshot,
      baselineDetailSnapshot,
      datasets,
      datasetsLoading,
      datasetsError,
      mutateDatasets,
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
      finalCandidateRequest,
      baselineConfigSummary,
      validateOverridePreview,
      representativeBaselineUserSnapshotId,
      setRepresentativeBaselineUserSnapshotId,
      effectiveRepresentativeBaselineSnapshotId,
      autoRepresentativeBaselineSnapshotId,
      representativeBaselinePickerOptions,
      selectedBaselineCount,
      selectedDataSummary,
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
      handleLoadToolContextFromSnapshots,
      selectedSnapshotIdsForRun,
      canRunValidate,
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
    ]
  );

  const pageContextParams = useReleaseGatePageContextParams(lv, rd, pageContextRest);
  const contextValue = useReleaseGatePageContextValue(pageContextParams);

  const { validateRunContextValue, gateBodyProps, releaseGateKeysContextValue } =
    useReleaseGatePageModelReturn({
      orgId,
      projectId,
      project,
      isValidating,
      activeJobId,
      cancelRequested,
      handleValidate,
      handleCancelActiveJob,
      error,
      result,
      keyBlocked,
      keyRegistrationMessage,
      showGateLoadingState,
      showGateAccessDeniedState,
      showGateApiErrorState,
      showGateEmptyState,
      viewMode,
      mutateAgents,
      agents,
      agentsLoaded,
      onMapSelectAgent,
    });

  const handleLayoutHudAction = useCallback((_actionId: string) => {}, []);

  return {
    validateRunContextValue,
    releaseGateKeysContextValue,
    contextValue,
    gateBodyProps,
    planError,
    layout: {
      orgId,
      projectId,
      projectName: project?.name,
      orgName: org?.name,
      onAction: handleLayoutHudAction,
    },
  };
}
