import type { Dispatch, SetStateAction } from "react";

import type { ReleaseGateConfigPanelContextSlice } from "./releaseGateConfigPanelContextPick";
import type { ReleaseGateConfigModalTab } from "./releaseGateConfigPanelTypes";
import type { ReleaseGateConfigPanelCoreTabModel } from "./useReleaseGateConfigPanelCoreTabModel";
import type { ReleaseGateConfigPanelParityTabModel } from "./useReleaseGateConfigPanelParityTabModel";
import type { ReleaseGateConfigPanelPreviewTabModel } from "./useReleaseGateConfigPanelPreviewTabModel";

export type ReleaseGateConfigPanelShellSlice = {
  editsLocked: boolean;
  showRawBaseline: boolean;
  setShowRawBaseline: Dispatch<SetStateAction<boolean>>;
  configTab: ReleaseGateConfigModalTab;
  setConfigTab: Dispatch<SetStateAction<ReleaseGateConfigModalTab>>;
  showExpandedCandidatePreview: boolean;
  setShowExpandedCandidatePreview: Dispatch<SetStateAction<boolean>>;
};

/** Full model = context slice + tab hooks + shell UI state (single merge object). */
export type ReleaseGateConfigPanelModel = ReleaseGateConfigPanelContextSlice &
  ReleaseGateConfigPanelCoreTabModel &
  ReleaseGateConfigPanelParityTabModel &
  ReleaseGateConfigPanelPreviewTabModel &
  ReleaseGateConfigPanelShellSlice;

/** Narrow props for each view; `releaseGateConfigPanelPickTabProps.ts` must list the same keys when passing from the shell. Context fields are typed on `ReleaseGatePageContextValue`. */
export type ReleaseGateConfigPanelCoreTabProps = Pick<
  ReleaseGateConfigPanelModel,
  | "REPLAY_PROVIDER_MODEL_LIBRARY"
  | "REPLAY_THRESHOLD_PRESETS"
  | "activeProviderTab"
  | "applySystemPromptToBody"
  | "baselinePayload"
  | "candidateJsonValue"
  | "editsLocked"
  | "failRateMax"
  | "flakyRateMax"
  | "handleRequestJsonBlur"
  | "handleResetJsonToBaseline"
  | "handleResetSystemPrompt"
  | "hostedReplayCreditsExhausted"
  | "isJsonModified"
  | "isSystemPromptOverridden"
  | "keyIssueBlocked"
  | "keyRegistrationMessage"
  | "canValidate"
  | "mutateProjectUserApiKeys"
  | "missingProviderKeyDetails"
  | "modelSource"
  | "setModelSource"
  | "modelOverrideEnabled"
  | "replayModelMode"
  | "setReplayModelMode"
  | "newModel"
  | "normalizeGateThresholds"
  | "pinnedBadge"
  | "projectId"
  | "replayProvider"
  | "replayApiKey"
  | "repeatRuns"
  | "requestBody"
  | "requestJsonDraft"
  | "requestJsonError"
  | "requestSystemPrompt"
  | "runDataModel"
  | "runDataProvider"
  | "setActiveProviderTab"
  | "setFailRateMax"
  | "setFlakyRateMax"
  | "setReplayApiKey"
  | "setModelOverrideEnabled"
  | "setNewModel"
  | "setReplayProvider"
  | "replayUserApiKeyId"
  | "setReplayUserApiKeyId"
  | "projectUserApiKeysForUi"
  | "setRequestBody"
  | "setRequestJsonDraft"
  | "setThresholdPreset"
  | "showCustomModelWarning"
  | "thresholdPreset"
  | "updateRequestNumberField"
>;

export type ReleaseGateConfigPanelParityTabProps = Pick<
  ReleaseGateConfigPanelModel,
  | "addTool"
  | "baselineTimelineLoading"
  | "baselineToolTimelineRows"
  | "requestBody"
  | "updateRequestNumberField"
  | "bodyOverridesFileInputRef"
  | "bodyOverridesJsonError"
  | "bodyOverridesJsonValue"
  | "bodyOverridesSnapshotDraftRaw"
  | "bodyOverridesSnapshotJsonError"
  | "clearBodyOverrides"
  | "contextSummarySubtitle"
  | "editsLocked"
  | "getSnapshotParityLabel"
  | "handleBodyOverridesJsonBlur"
  | "handleBodyOverridesSnapshotBlur"
  | "handleLoadToolContextFromSnapshots"
  | "hasAnyBodyOverridesContent"
  | "onBodyOverridesFileChange"
  | "onToolContextFileChange"
  | "overridesSummarySubtitle"
  | "parityOpenContext"
  | "parityOpenOverrides"
  | "parityOpenRecordedToolCalls"
  | "parityOpenTools"
  | "recordedCallsSummarySubtitle"
  | "removeTool"
  | "requestBodyOverridesBySnapshotId"
  | "resetParityPerLogOverridesToBaseline"
  | "resetParitySharedOverridesToBaseline"
  | "resetParityToolContextToBaseline"
  | "resetParityToolsToBaseline"
  | "selectedSnapshotIdsForRun"
  | "setBodyOverridesJsonDraft"
  | "setBodyOverridesSnapshotDraftRaw"
  | "setParityOpenContext"
  | "setParityOpenOverrides"
  | "setParityOpenRecordedToolCalls"
  | "setParityOpenTools"
  | "setToolContextBySnapshotId"
  | "setToolContextGlobalText"
  | "setToolContextMode"
  | "setToolContextScope"
  | "snapshotIdForBaselineTimeline"
  | "toolContextBySnapshotId"
  | "toolContextFileInputRef"
  | "toolContextGlobalText"
  | "toolContextLoadBusy"
  | "toolContextMode"
  | "toolContextScope"
  | "toolsList"
  | "toolsSummarySubtitle"
  | "triggerBodyOverridesFilePick"
  | "triggerToolContextFilePick"
  | "updateTool"
>;

export type ReleaseGateConfigPanelPreviewTabProps = Pick<
  ReleaseGateConfigPanelModel,
  | "candidateRequestOverview"
  | "finalCandidateJson"
  | "parityCandidateShapeNotes"
  | "parityEnvironmentNotes"
  | "representativeBaselineId"
  | "selectedBaselineCount"
  | "setShowExpandedCandidatePreview"
  | "usingModel"
  | "usingProvider"
  | "validateOverridePreview"
>;

export type ReleaseGateConfigPanelBaselineColumnProps = Pick<
  ReleaseGateConfigPanelModel,
  | "autoRepresentativeBaselineSnapshotId"
  | "baselineConfigSummary"
  | "baselineRequestOverview"
  | "editsLocked"
  | "paritySummaryLines"
  | "representativeBaselineId"
  | "representativeBaselinePickerOptions"
  | "representativeBaselineUserSnapshotId"
  | "runDataModel"
  | "runDataProvider"
  | "runDataPrompt"
  | "selectedBaselineCount"
  | "selectedDataSummary"
  | "setRepresentativeBaselineUserSnapshotId"
  | "setShowRawBaseline"
>;
