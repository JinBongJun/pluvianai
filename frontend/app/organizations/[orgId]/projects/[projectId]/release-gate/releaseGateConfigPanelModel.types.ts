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
  | "editsLocked"
  | "failRateMax"
  | "flakyRateMax"
  | "handleResetSystemPrompt"
  | "hostedReplayCreditsExhausted"
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
  | "baselinePayload"
  | "candidateJsonValue"
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
  | "handleRequestJsonBlur"
  | "handleResetJsonToBaseline"
  | "handleBodyOverridesJsonBlur"
  | "handleBodyOverridesSnapshotBlur"
  | "handleLoadToolContextFromSnapshots"
  | "hasAnyBodyOverridesContent"
  | "isJsonModified"
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
  | "requestJsonError"
  | "resetParityPerLogOverridesToBaseline"
  | "resetParitySharedOverridesToBaseline"
  | "resetParityToolContextToBaseline"
  | "resetParityToolsToBaseline"
  | "selectedSnapshotIdsForRun"
  | "setRequestJsonDraft"
  | "setBodyOverridesJsonDraft"
  | "setBodyOverridesSnapshotDraftRaw"
  | "setParityOpenContext"
  | "setParityOpenOverrides"
  | "setParityOpenRawJson"
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
  | "parityOpenRawJson"
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
  | "toolsList"
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
