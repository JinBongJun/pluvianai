import { toReplayProvider } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateKeysContextValue } from "./ReleaseGateKeysContext";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import type { ReleaseGateValidateRunContextValue } from "./ReleaseGateValidateRunContext";

export type ReleaseGateConfigPanelContextSlice = ReturnType<typeof pickReleaseGateConfigPanelContext>;

/**
 * Projects `ReleaseGatePageContextValue` + validate-run slice into the flat object the config panel hooks expect.
 * Types live on `ReleaseGatePageContextValue`; this function only normalizes a few values (e.g. `runDataPrompt` null → "").
 */
export function pickReleaseGateConfigPanelContext(
  ctx: ReleaseGatePageContextValue,
  vctx: ReleaseGateValidateRunContextValue,
  kctx: ReleaseGateKeysContextValue
) {
  const baselineSeedSnapshot = ctx.baselineSeedSnapshot;
  const representativeBaselineId =
    baselineSeedSnapshot?.id != null ? String(baselineSeedSnapshot.id) : null;

  return {
    REPLAY_PROVIDER_MODEL_LIBRARY: ctx.REPLAY_PROVIDER_MODEL_LIBRARY,
    REPLAY_THRESHOLD_PRESETS: ctx.REPLAY_THRESHOLD_PRESETS,
    thresholdPreset: ctx.thresholdPreset ?? "default",
    setThresholdPreset: ctx.setThresholdPreset,
    normalizeGateThresholds: ctx.normalizeGateThresholds,
    failRateMax: ctx.failRateMax,
    setFailRateMax: ctx.setFailRateMax,
    flakyRateMax: ctx.flakyRateMax,
    setFlakyRateMax: ctx.setFlakyRateMax,
    newModel: ctx.newModel,
    setNewModel: ctx.setNewModel,
    modelSource: ctx.modelSource,
    setModelSource: ctx.setModelSource,
    modelOverrideEnabled: ctx.modelOverrideEnabled,
    setModelOverrideEnabled: ctx.setModelOverrideEnabled,
    replayModelMode: ctx.replayModelMode,
    setReplayModelMode: ctx.setReplayModelMode,
    replayProvider: toReplayProvider(ctx.replayProvider),
    setReplayProvider: ctx.setReplayProvider,
    replayUserApiKeyId: ctx.replayUserApiKeyId,
    setReplayUserApiKeyId: ctx.setReplayUserApiKeyId,
    replayApiKey: ctx.replayApiKey,
    setReplayApiKey: ctx.setReplayApiKey,
    projectUserApiKeysForUi: ctx.projectUserApiKeysForUi,
    canValidate: ctx.canValidate,
    mutateProjectUserApiKeys: ctx.mutateProjectUserApiKeys,
    keyBlocked: kctx.keyBlocked,
    keyIssueBlocked: kctx.keyIssueBlocked,
    keyRegistrationMessage: kctx.keyRegistrationMessage,
    missingProviderKeyDetails: kctx.missingProviderKeyDetails,
    requestBody: ctx.requestBody,
    setRequestBody: ctx.setRequestBody,
    requestBodyJson: ctx.requestBodyJson,
    requestJsonDraft: ctx.requestJsonDraft,
    setRequestJsonDraft: ctx.setRequestJsonDraft,
    requestJsonError: ctx.requestJsonError,
    requestBodyOverrides: ctx.requestBodyOverrides,
    requestBodyOverridesJson: ctx.requestBodyOverridesJson,
    bodyOverridesJsonDraft: ctx.bodyOverridesJsonDraft,
    setBodyOverridesJsonDraft: ctx.setBodyOverridesJsonDraft,
    bodyOverridesJsonError: ctx.bodyOverridesJsonError,
    setBodyOverridesJsonError: ctx.setBodyOverridesJsonError,
    requestBodyOverridesBySnapshotId: ctx.requestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw: ctx.bodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotDraftRaw: ctx.setBodyOverridesSnapshotDraftRaw,
    bodyOverridesSnapshotJsonError: ctx.bodyOverridesSnapshotJsonError,
    setBodyOverridesSnapshotJsonError: ctx.setBodyOverridesSnapshotJsonError,
    handleBodyOverridesJsonBlur: ctx.handleBodyOverridesJsonBlur,
    handleBodyOverridesSnapshotBlur: ctx.handleBodyOverridesSnapshotBlur,
    applyLoadedGlobalBodyOverrides: ctx.applyLoadedGlobalBodyOverrides,
    applyLoadedSnapshotBodyOverrides: ctx.applyLoadedSnapshotBodyOverrides,
    clearBodyOverrides: ctx.clearBodyOverrides,
    resetParitySharedOverridesToBaseline: ctx.resetParitySharedOverridesToBaseline,
    resetParityPerLogOverridesToBaseline: ctx.resetParityPerLogOverridesToBaseline,
    resetParityToolsToBaseline: ctx.resetParityToolsToBaseline,
    resetParityToolContextToBaseline: ctx.resetParityToolContextToBaseline,
    baselineSnapshotsById: ctx.baselineSnapshotsById,
    handleRequestJsonBlur: ctx.handleRequestJsonBlur,
    applySystemPromptToBody: ctx.applySystemPromptToBody,
    requestSystemPrompt: ctx.requestSystemPrompt,
    toolsList: ctx.toolsList,
    setToolsList: ctx.setToolsList,
    runDataProvider: toReplayProvider(ctx.runDataProvider),
    runDataModel: ctx.runDataModel,
    runDataPrompt: ctx.runDataPrompt ?? "",
    baselineSeedSnapshotForOverview: baselineSeedSnapshot,
    representativeBaselineId,
    baselinePayload: ctx.baselinePayload,
    finalCandidateRequest: ctx.finalCandidateRequest,
    baselineConfigSummary: ctx.baselineConfigSummary,
    validateOverridePreview: ctx.validateOverridePreview,
    selectedBaselineCount: ctx.selectedBaselineCount,
    selectedDataSummary:
      ctx.selectedDataSummary ??
      'No baseline data yet. Select representative "good" snapshots from Live Logs or Saved Data.',
    runLocked: vctx.isValidating || Boolean(vctx.activeJobId),
    repeatRuns: ctx.repeatRuns,
    toolContextMode: ctx.toolContextMode,
    setToolContextMode: ctx.setToolContextMode,
    toolContextScope: ctx.toolContextScope,
    setToolContextScope: ctx.setToolContextScope,
    toolContextGlobalText: ctx.toolContextGlobalText,
    setToolContextGlobalText: ctx.setToolContextGlobalText,
    toolContextBySnapshotId: ctx.toolContextBySnapshotId,
    setToolContextBySnapshotId: ctx.setToolContextBySnapshotId,
    toolContextLoadBusy: ctx.toolContextLoadBusy,
    handleLoadToolContextFromSnapshots: ctx.handleLoadToolContextFromSnapshots,
    selectedSnapshotIdsForRun: ctx.selectedSnapshotIdsForRun,
    hostedReplayCreditsExhausted: ctx.hostedReplayCreditsExhausted,
    representativeBaselineUserSnapshotId: ctx.representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId: ctx.setRepresentativeBaselineUserSnapshotId,
    autoRepresentativeBaselineSnapshotId: ctx.autoRepresentativeBaselineSnapshotId,
    representativeBaselinePickerOptions: ctx.representativeBaselinePickerOptions,
    projectId: ctx.projectId,
    baselineSeedSnapshot,
    runSnapshotIds: ctx.runSnapshotIds,
  };
}
