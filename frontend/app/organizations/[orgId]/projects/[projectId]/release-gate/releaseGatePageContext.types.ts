import type { Dispatch, RefObject, SetStateAction } from "react";
import type { SnapshotForDetail } from "@/components/shared/SnapshotDetailModal";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import type { ReleaseGateHistoryItem } from "@/lib/api/types";
import type { GateTab, ThresholdPreset } from "./releaseGateExpandedHelpers";

export type ReleaseGateReplayProvider = "openai" | "anthropic" | "google";

export type ReleaseGateHistoryDatePreset = "all" | "24h" | "7d" | "30d";

export type ReleaseGateEditableTool = {
  id: string;
  name: string;
  description: string;
  parameters: string;
};

export type ReleaseGateDatasetSummary = {
  id: string;
  label?: string;
  snapshot_ids?: unknown[];
  snapshot_count?: number;
};

export type ReleaseGateThresholdShape = { label: string; failRateMax: number; flakyRateMax: number };

/**
 * Full value provided by `ReleaseGatePageContent` — consumers should use
 * `useContext(ReleaseGatePageContext)` and handle `null` only when outside the provider.
 */
export interface ReleaseGatePageContextValue {
  orgId: string;
  projectId: number;
  project: { name?: string } | undefined;
  tab: GateTab;
  setTab: (t: GateTab) => void;
  setViewMode: (m: "map" | "expanded") => void;
  setAgentId: (s: string) => void;
  setSelectedAgent: Dispatch<SetStateAction<AgentForPicker | null>>;
  setDatasetIds: (a: string[]) => void;
  setSnapshotIds: (a: string[]) => void;
  setRunSnapshotIds: Dispatch<SetStateAction<string[]>>;
  setRunDatasetIds: Dispatch<SetStateAction<string[]>>;
  dataSource: "recent" | "datasets";
  setExpandedDatasetId: Dispatch<SetStateAction<string | null>>;
  selectedAgent: AgentForPicker | null;
  agentsLoaded: boolean;
  agents: AgentForPicker[];
  onMapSelectAgent: (id: string) => void;
  requestSystemPrompt: string;
  recentSnapshots: Array<Record<string, unknown>>;
  recentSnapshotsTotalAvailable: number | undefined;
  recentSnapshotsLoading: boolean;
  recentSnapshotsError: unknown;
  mutateRecentSnapshots: (() => unknown) | undefined;
  baselineSnapshotsById: Map<string, Record<string, unknown>>;
  runSnapshotIds: string[];
  setDataSource: (s: "recent" | "datasets") => void;
  snapshotEvalFailed: (s: Record<string, unknown> | null) => boolean;
  setBaselineDetailSnapshot: (s: SnapshotForDetail | null) => void;
  openBaselineDetailSnapshot: (s: Record<string, unknown>) => void;
  datasets: ReleaseGateDatasetSummary[];
  datasetsLoading: boolean;
  datasetsError: unknown;
  mutateDatasets: (() => unknown) | undefined;
  runDatasetIds: string[];
  expandedDatasetId: string | null;
  expandedDatasetSnapshots: Record<string, unknown>[];
  datasetSnapshotsLoading: boolean;
  datasetSnapshotsError: unknown;
  datasetSnapshots404: boolean;
  mutateDatasetSnapshots: (() => unknown) | undefined;
  expandedDatasetSnapshotsLoading: boolean;
  expandedDatasetSnapshotsError: unknown;
  expandedDatasetSnapshots404: boolean;
  mutateExpandedDatasetSnapshots: (() => unknown) | undefined;
  baselineSeedSnapshot: Record<string, unknown> | null;
  baselinePayload: Record<string, unknown> | null;
  nodeBasePayload: Record<string, unknown> | null;
  finalCandidateRequest: Record<string, unknown> | null;
  baselineConfigSummary: string;
  validateOverridePreview: Record<string, unknown>;
  configSourceLabel: string;
  representativeBaselineUserSnapshotId: string | null;
  setRepresentativeBaselineUserSnapshotId: Dispatch<SetStateAction<string | null>>;
  effectiveRepresentativeBaselineSnapshotId: string | null;
  autoRepresentativeBaselineSnapshotId: string | null;
  representativeBaselinePickerOptions: { id: string; createdAt: string }[];
  selectedBaselineCount: number;
  selectedDataSummary: string;
  REPLAY_PROVIDER_MODEL_LIBRARY: Record<ReleaseGateReplayProvider, string[]>;
  REPLAY_THRESHOLD_PRESETS: Record<string, ReleaseGateThresholdShape>;
  thresholdPreset: ThresholdPreset;
  setThresholdPreset: (k: ThresholdPreset) => void;
  normalizeGateThresholds: (
    failRateMax: unknown,
    flakyRateMax: unknown
  ) => { failRateMax: number; flakyRateMax: number };
  failRateMax: number;
  setFailRateMax: (n: number) => void;
  flakyRateMax: number;
  setFlakyRateMax: (n: number) => void;
  newModel: string;
  setNewModel: (s: string) => void;
  modelOverrideEnabled: boolean;
  setModelOverrideEnabled: (b: boolean) => void;
  replayProvider: ReleaseGateReplayProvider;
  setReplayProvider: (p: ReleaseGateReplayProvider) => void;
  requestBody: Record<string, unknown>;
  setRequestBody: Dispatch<SetStateAction<Record<string, unknown>>>;
  requestBodyJson: string;
  requestJsonDraft: string | null;
  setRequestJsonDraft: (v: string | null) => void;
  requestJsonError: string;
  requestBodyOverrides: Record<string, unknown>;
  setRequestBodyOverrides: Dispatch<SetStateAction<Record<string, unknown>>>;
  requestBodyOverridesJson: string;
  bodyOverridesJsonDraft: string | null;
  setBodyOverridesJsonDraft: (v: string | null) => void;
  bodyOverridesJsonError: string;
  setBodyOverridesJsonError: (s: string) => void;
  requestBodyOverridesBySnapshotId: Record<string, Record<string, unknown>>;
  bodyOverridesSnapshotDraftRaw: Record<string, string>;
  setBodyOverridesSnapshotDraftRaw: Dispatch<SetStateAction<Record<string, string>>>;
  bodyOverridesSnapshotJsonError: Record<string, string>;
  setBodyOverridesSnapshotJsonError: Dispatch<SetStateAction<Record<string, string>>>;
  handleBodyOverridesJsonBlur: () => void;
  handleBodyOverridesSnapshotBlur: (sid: string) => void;
  applyLoadedGlobalBodyOverrides: (obj: Record<string, unknown>) => void;
  applyLoadedSnapshotBodyOverrides: (sid: string, obj: Record<string, unknown>) => void;
  clearBodyOverrides: () => void;
  handleRequestJsonBlur: () => void;
  applySystemPromptToBody: (
    b: Record<string, unknown>,
    s: string
  ) => Record<string, unknown>;
  toolsList: ReleaseGateEditableTool[];
  setToolsList: Dispatch<SetStateAction<ReleaseGateEditableTool[]>>;
  toolContextMode: "recorded" | "inject";
  setToolContextMode: Dispatch<SetStateAction<"recorded" | "inject">>;
  toolContextScope: "global" | "per_snapshot";
  setToolContextScope: Dispatch<SetStateAction<"global" | "per_snapshot">>;
  toolContextGlobalText: string;
  setToolContextGlobalText: (t: string) => void;
  toolContextBySnapshotId: Record<string, string>;
  setToolContextBySnapshotId: Dispatch<SetStateAction<Record<string, string>>>;
  toolContextLoadBusy: boolean;
  handleLoadToolContextFromSnapshots: () => void | Promise<void>;
  selectedSnapshotIdsForRun: string[];
  repeatRuns: number;
  setRepeatRuns: (n: number) => void;
  repeatDropdownOpen: boolean;
  setRepeatDropdownOpen: (b: boolean) => void;
  repeatDropdownRef: RefObject<HTMLDivElement>;
  REPEAT_OPTIONS: readonly number[];
  isHeavyRepeat: boolean;
  canRunValidate: boolean;
  keyBlocked: boolean;
  keyRegistrationMessage: string;
  expandedCaseIndex: number | null;
  setExpandedCaseIndex: (n: number | null) => void;
  selectedAttempt: { caseIndex: number; attemptIndex: number } | null;
  setSelectedAttempt: Dispatch<
    SetStateAction<{ caseIndex: number; attemptIndex: number } | null>
  >;
  baselineDetailSnapshot: SnapshotForDetail | null;
  agentEvalData: Record<string, unknown> | undefined;
  runEvalElements: Array<{ name: string; value: unknown }>;
  historyStatus: "all" | "pass" | "fail";
  setHistoryStatus: (s: "all" | "pass" | "fail") => void;
  historyTraceId: string;
  setHistoryTraceId: (s: string) => void;
  historyDatePreset: ReleaseGateHistoryDatePreset;
  setHistoryDatePreset: (p: ReleaseGateHistoryDatePreset) => void;
  historyOffset: number;
  setHistoryOffset: (n: number | ((v: number) => number)) => void;
  historyLimit: number;
  historyLoading: boolean;
  historyRefreshing: boolean;
  historyItems: ReleaseGateHistoryItem[];
  historyTotal: number;
  mutateHistory: () => void;
  selectedRunId: string | null;
  setSelectedRunId: (id: string | null) => void;
  selectedRunReport: unknown;
  selectedRunReportLoading: boolean;
  selectedRunReportError: unknown;
  expandedHistoryId: string | null;
  setExpandedHistoryId: Dispatch<SetStateAction<string | null>>;
  runDataProvider: string | null;
  runDataModel: string;
  runDataPrompt: string | null;
}
