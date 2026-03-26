"use client";

import { useMemo, useRef, useState } from "react";

import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { useDismissOnDocumentClickOutside } from "./useDismissOnDocumentClickOutside";
import type { EditableTool, ReplayProvider } from "./releaseGatePageContent.lib";
import { REPLAY_THRESHOLD_PRESETS } from "./releaseGatePageContent.lib";
import type { GateTab, ThresholdPreset } from "./releaseGateExpandedHelpers";

/** §2 local UI + replay editor state for Release Gate (memoized bundle for orchestrator merges). */
export function useReleaseGatePageLocalState() {
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
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [dataSource, setDataSource] = useState<"recent" | "datasets">("recent");
  const [snapshotIds, setSnapshotIds] = useState<string[]>([]);
  const [newModel, setNewModel] = useState("");
  const [replayProvider, setReplayProvider] = useState<ReplayProvider>("openai");
  /** Saved project API key row id for Custom (BYOK) runs; optional. */
  const [replayUserApiKeyId, setReplayUserApiKeyId] = useState<number | null>(null);
  const [modelOverrideEnabled, setModelOverrideEnabled] = useState(false);
  const [modelProviderTab, setModelProviderTab] = useState<ReplayProvider>("openai");
  const [requestBody, setRequestBody] = useState<Record<string, unknown>>({});
  const [requestJsonDraft, setRequestJsonDraft] = useState<string | null>(null);
  const [requestJsonError, setRequestJsonError] = useState("");
  const [requestBodyOverrides, setRequestBodyOverrides] = useState<Record<string, unknown>>({});
  const [bodyOverridesJsonDraft, setBodyOverridesJsonDraft] = useState<string | null>(null);
  const [bodyOverridesJsonError, setBodyOverridesJsonError] = useState("");
  const [requestBodyOverridesBySnapshotId, setRequestBodyOverridesBySnapshotId] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [bodyOverridesSnapshotDraftRaw, setBodyOverridesSnapshotDraftRaw] = useState<
    Record<string, string>
  >({});
  const [bodyOverridesSnapshotJsonError, setBodyOverridesSnapshotJsonError] = useState<
    Record<string, string>
  >({});
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
  const [representativeBaselineUserSnapshotId, setRepresentativeBaselineUserSnapshotId] = useState<
    string | null
  >(null);

  const [runDatasetIds, setRunDatasetIds] = useState<string[]>([]);
  const [runSnapshotIds, setRunSnapshotIds] = useState<string[]>([]);
  const [expandedDatasetId, setExpandedDatasetId] = useState<string | null>(null);

  const [selectedRunResultIndex, setSelectedRunResultIndex] = useState<number | null>(null);
  const [expandedCaseIndex, setExpandedCaseIndex] = useState<number | null>(null);
  const [selectedAttempt, setSelectedAttempt] = useState<{
    caseIndex: number;
    attemptIndex: number;
  } | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  return useMemo(
    () => ({
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
      replayUserApiKeyId,
      setReplayUserApiKeyId,
      modelOverrideEnabled,
      setModelOverrideEnabled,
      modelProviderTab,
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
    }),
    [
      tab,
      viewMode,
      repeatRuns,
      repeatDropdownOpen,
      isHeavyRepeat,
      thresholdPreset,
      failRateMax,
      flakyRateMax,
      agentId,
      selectedAgent,
      datasetIds,
      dataSource,
      snapshotIds,
      newModel,
      replayProvider,
      replayUserApiKeyId,
      modelOverrideEnabled,
      modelProviderTab,
      requestBody,
      requestJsonDraft,
      requestJsonError,
      requestBodyOverrides,
      bodyOverridesJsonDraft,
      bodyOverridesJsonError,
      requestBodyOverridesBySnapshotId,
      bodyOverridesSnapshotDraftRaw,
      bodyOverridesSnapshotJsonError,
      toolsList,
      toolContextMode,
      toolContextScope,
      toolContextGlobalText,
      toolContextBySnapshotId,
      toolContextLoadBusy,
      representativeBaselineUserSnapshotId,
      runDatasetIds,
      runSnapshotIds,
      expandedDatasetId,
      selectedRunResultIndex,
      expandedCaseIndex,
      selectedAttempt,
      expandedHistoryId,
      selectedRunId,
    ]
  );
}

export type ReleaseGatePageLocalStateBundle = ReturnType<typeof useReleaseGatePageLocalState>;
