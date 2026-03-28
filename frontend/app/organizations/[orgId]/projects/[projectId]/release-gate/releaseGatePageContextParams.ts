import type { UseReleaseGatePageContextValueParams } from "./useReleaseGatePageContextValue";
import type { ReleaseGatePageLocalStateBundle } from "./useReleaseGatePageLocalState";
import type { ReleaseGateRunDataDerivationsBundle } from "./useReleaseGateRunDataDerivations";

/** Everything merged into page context that is not supplied by `local` or `runData` bundles. */
export type ReleaseGatePageContextRestSlice = Pick<
  UseReleaseGatePageContextValueParams,
  | "orgId"
  | "projectId"
  | "project"
  | "agents"
  | "agentsLoaded"
  | "onMapSelectAgent"
  | "requestSystemPrompt"
  | "requestBodyJson"
  | "requestBodyOverridesJson"
  | "recentSnapshots"
  | "recentSnapshotsTotalAvailable"
  | "recentSnapshotsLoading"
  | "recentSnapshotsError"
  | "mutateRecentSnapshots"
  | "baselineSnapshotsById"
  | "setBaselineDetailSnapshot"
  | "openBaselineDetailSnapshot"
  | "baselineDetailSnapshot"
  | "datasets"
  | "datasetsLoading"
  | "datasetsError"
  | "mutateDatasets"
  | "expandedDatasetSnapshots"
  | "datasetSnapshotsLoading"
  | "datasetSnapshotsError"
  | "datasetSnapshots404"
  | "mutateDatasetSnapshots"
  | "expandedDatasetSnapshotsLoading"
  | "expandedDatasetSnapshotsError"
  | "expandedDatasetSnapshots404"
  | "mutateExpandedDatasetSnapshots"
  | "baselineSeedSnapshot"
  | "finalCandidateRequest"
  | "baselineConfigSummary"
  | "validateOverridePreview"
  | "representativeBaselineUserSnapshotId"
  | "setRepresentativeBaselineUserSnapshotId"
  | "effectiveRepresentativeBaselineSnapshotId"
  | "autoRepresentativeBaselineSnapshotId"
  | "representativeBaselinePickerOptions"
  | "selectedBaselineCount"
  | "selectedDataSummary"
  | "handleBodyOverridesJsonBlur"
  | "handleBodyOverridesSnapshotBlur"
  | "applyLoadedGlobalBodyOverrides"
  | "applyLoadedSnapshotBodyOverrides"
  | "clearBodyOverrides"
  | "resetParitySharedOverridesToBaseline"
  | "resetParityPerLogOverridesToBaseline"
  | "resetParityToolsToBaseline"
  | "resetParityToolContextToBaseline"
  | "handleRequestJsonBlur"
  | "handleLoadToolContextFromSnapshots"
  | "selectedSnapshotIdsForRun"
  | "canRunValidate"
  | "canValidate"
  | "mutateProjectUserApiKeys"
  | "historyStatus"
  | "setHistoryStatus"
  | "historyTraceId"
  | "setHistoryTraceId"
  | "historyDatePreset"
  | "setHistoryDatePreset"
  | "historyOffset"
  | "setHistoryOffset"
  | "historyLimit"
  | "historyLoading"
  | "historyRefreshing"
  | "historyItems"
  | "historyTotal"
  | "mutateHistory"
  | "projectUserApiKeysForUi"
>;

export function buildReleaseGatePageContextParams(
  lv: ReleaseGatePageLocalStateBundle,
  rd: ReleaseGateRunDataDerivationsBundle,
  rest: ReleaseGatePageContextRestSlice
): UseReleaseGatePageContextValueParams {
  const modelOverrideEnabled = lv.modelSource !== "detected";
  const replayModelMode = lv.modelSource === "hosted" ? "hosted" : "custom";
  return {
    ...rest,
    tab: lv.tab,
    setTab: lv.setTab,
    setViewMode: lv.setViewMode,
    setAgentId: lv.setAgentId,
    setSelectedAgent: lv.setSelectedAgent,
    setDatasetIds: lv.setDatasetIds,
    setSnapshotIds: lv.setSnapshotIds,
    setRunSnapshotIds: lv.setRunSnapshotIds,
    setRunDatasetIds: lv.setRunDatasetIds,
    dataSource: lv.dataSource,
    setExpandedDatasetId: lv.setExpandedDatasetId,
    setDataSource: lv.setDataSource,
    selectedAgent: lv.selectedAgent,
    repeatRuns: lv.repeatRuns,
    setRepeatRuns: lv.setRepeatRuns,
    repeatDropdownOpen: lv.repeatDropdownOpen,
    setRepeatDropdownOpen: lv.setRepeatDropdownOpen,
    repeatDropdownRef: lv.repeatDropdownRef,
    isHeavyRepeat: lv.isHeavyRepeat,
    thresholdPreset: lv.thresholdPreset,
    setThresholdPreset: lv.setThresholdPreset,
    failRateMax: lv.failRateMax,
    setFailRateMax: lv.setFailRateMax,
    flakyRateMax: lv.flakyRateMax,
    setFlakyRateMax: lv.setFlakyRateMax,
    newModel: lv.newModel,
    setNewModel: lv.setNewModel,
    modelSource: lv.modelSource,
    setModelSource: lv.setModelSource,
    modelOverrideEnabled,
    setModelOverrideEnabled: enabled => lv.setModelSource(enabled ? "hosted" : "detected"),
    replayModelMode,
    setReplayModelMode: mode => lv.setModelSource(typeof mode === "function" ? mode(replayModelMode) : mode),
    replayProvider: lv.replayProvider,
    setReplayProvider: lv.setReplayProvider,
    replayUserApiKeyId: lv.replayUserApiKeyId,
    setReplayUserApiKeyId: lv.setReplayUserApiKeyId,
    replayApiKey: lv.replayApiKey,
    setReplayApiKey: lv.setReplayApiKey,
    projectUserApiKeysForUi: rest.projectUserApiKeysForUi,
    requestBody: lv.requestBody,
    setRequestBody: lv.setRequestBody,
    requestJsonDraft: lv.requestJsonDraft,
    setRequestJsonDraft: lv.setRequestJsonDraft,
    requestJsonError: lv.requestJsonError,
    requestBodyOverrides: lv.requestBodyOverrides,
    setRequestBodyOverrides: lv.setRequestBodyOverrides,
    bodyOverridesJsonDraft: lv.bodyOverridesJsonDraft,
    setBodyOverridesJsonDraft: lv.setBodyOverridesJsonDraft,
    bodyOverridesJsonError: lv.bodyOverridesJsonError,
    setBodyOverridesJsonError: lv.setBodyOverridesJsonError,
    requestBodyOverridesBySnapshotId: lv.requestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw: lv.bodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotDraftRaw: lv.setBodyOverridesSnapshotDraftRaw,
    bodyOverridesSnapshotJsonError: lv.bodyOverridesSnapshotJsonError,
    setBodyOverridesSnapshotJsonError: lv.setBodyOverridesSnapshotJsonError,
    toolsList: lv.toolsList,
    setToolsList: lv.setToolsList,
    toolContextMode: lv.toolContextMode,
    setToolContextMode: lv.setToolContextMode,
    toolContextScope: lv.toolContextScope,
    setToolContextScope: lv.setToolContextScope,
    toolContextGlobalText: lv.toolContextGlobalText,
    setToolContextGlobalText: lv.setToolContextGlobalText,
    toolContextBySnapshotId: lv.toolContextBySnapshotId,
    setToolContextBySnapshotId: lv.setToolContextBySnapshotId,
    toolContextLoadBusy: lv.toolContextLoadBusy,
    expandedCaseIndex: lv.expandedCaseIndex,
    setExpandedCaseIndex: lv.setExpandedCaseIndex,
    selectedAttempt: lv.selectedAttempt,
    setSelectedAttempt: lv.setSelectedAttempt,
    expandedHistoryId: lv.expandedHistoryId,
    setExpandedHistoryId: lv.setExpandedHistoryId,
    selectedRunId: lv.selectedRunId,
    setSelectedRunId: lv.setSelectedRunId,
    runSnapshotIds: lv.runSnapshotIds,
    runDatasetIds: lv.runDatasetIds,
    expandedDatasetId: lv.expandedDatasetId,
    REPLAY_PROVIDER_MODEL_LIBRARY: rd.replayProviderModelLibrary,
    agentEvalData: rd.agentEvalData,
    runEvalElements: rd.runEvalElements,
    selectedRunReport: rd.selectedRunReport,
    selectedRunReportLoading: rd.selectedRunReportLoading,
    selectedRunReportError: rd.selectedRunReportError,
    baselinePayload: rd.baselinePayload,
    nodeBasePayload: rd.nodeBasePayload,
    configSourceLabel: rd.configSourceLabel,
    runDataProvider: rd.runDataProvider,
    runDataModel: rd.runDataModel,
    runDataPrompt: rd.runDataPrompt,
  };
}
