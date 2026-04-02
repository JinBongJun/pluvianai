"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ReleaseGateKeysContextValue } from "./ReleaseGateKeysContext";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import type { ReleaseGateValidateRunContextValue } from "./ReleaseGateValidateRunContext";
import { buildReleaseGateMapRgDetails } from "./releaseGateExpandedMapRgDetails";
import {
  useReleaseGateExpandedHistoryOverlay,
  type ExpandedDetailAttemptView,
} from "./useReleaseGateExpandedHistoryOverlay";
import { useReleaseGateExpandedAgentReset } from "./useReleaseGateExpandedAgentReset";
import { useReleaseGateExpandedResultPanel } from "./useReleaseGateExpandedResultPanel";
import { useReleaseGateExpandedLogsPanel } from "./useReleaseGateExpandedLogsPanel";
import {
  formatHistoryDateFilterSummary,
  snapshotHasPerLogBodyOverride,
} from "./releaseGateViewUtils";
import { useToast } from "@/components/ToastContainer";

export type UseReleaseGateExpandedViewModelArgs = {
  ctx: ReleaseGatePageContextValue;
  vctx: ReleaseGateValidateRunContextValue;
  keysCtx: ReleaseGateKeysContextValue;
};

/**
 * Composes expanded-view UI state. Sub-hooks must stay in this order (each may depend on prior state):
 * `resultPanel` → `historyOverlay` → `agentReset` (uses overlay clear + result filter setter) → `logsPanel` → memos/`rgDetails`.
 */
export function useReleaseGateExpandedViewModel({
  ctx,
  vctx,
  keysCtx,
}: UseReleaseGateExpandedViewModelArgs) {
  const toast = useToast();
  const orgId = ctx.orgId;
  const projectId = ctx.projectId;
  const project = ctx.project;
  const rawAgentId = ctx.agentId;
  const tab = ctx.tab;
  const setTab = ctx.setTab;
  const setViewMode = ctx.setViewMode;
  const setAgentId = ctx.setAgentId;
  const setSelectedAgent = ctx.setSelectedAgent;
  const setDatasetIds = ctx.setDatasetIds;
  const setSnapshotIds = ctx.setSnapshotIds;
  const setRunSnapshotIds = ctx.setRunSnapshotIds;
  const setRunDatasetIds = ctx.setRunDatasetIds;
  const setExpandedDatasetId = ctx.setExpandedDatasetId;
  const selectedAgent = ctx.selectedAgent;
  const agents = ctx.agents;
  const agentsLoaded = ctx.agentsLoaded;
  const onMapSelectAgent = ctx.onMapSelectAgent;
  const requestSystemPrompt = ctx.requestSystemPrompt;
  const runDataPrompt = ctx.runDataPrompt ?? "";
  const baselineSeedSnapshot = ctx.baselineSeedSnapshot;
  const baselinePayload = ctx.baselinePayload;
  const nodeBasePayload = ctx.nodeBasePayload;
  const configSourceLabel = ctx.configSourceLabel || "";
  const recentSnapshots = ctx.recentSnapshots;
  const recentSnapshotsTotalAvailable = ctx.recentSnapshotsTotalAvailable;
  const recentSnapshotsLoading = ctx.recentSnapshotsLoading;
  const recentSnapshotsError = ctx.recentSnapshotsError;
  const mutateRecentSnapshots = ctx.mutateRecentSnapshots;
  const baselineSnapshotsById = ctx.baselineSnapshotsById;
  const runSnapshotIds = ctx.runSnapshotIds;
  const selectedSnapshotIdsForRun = ctx.selectedSnapshotIdsForRun;
  const requestBodyOverridesBySnapshotId = ctx.requestBodyOverridesBySnapshotId;
  const bodyOverridesSnapshotDraftRaw = ctx.bodyOverridesSnapshotDraftRaw;
  const toolContextMode = ctx.toolContextMode;
  const toolContextScope = ctx.toolContextScope;
  const toolContextGlobalText = ctx.toolContextGlobalText;
  const toolContextBySnapshotId = ctx.toolContextBySnapshotId;
  const setDataSource = ctx.setDataSource;
  const dataSource = ctx.dataSource;
  const snapshotEvalFailed = ctx.snapshotEvalFailed;
  const setBaselineDetailSnapshot = ctx.setBaselineDetailSnapshot;
  const openBaselineDetailSnapshot = ctx.openBaselineDetailSnapshot;
  const datasets = ctx.datasets;
  const datasetsLoading = ctx.datasetsLoading;
  const datasetsError = ctx.datasetsError;
  const mutateDatasets = ctx.mutateDatasets;
  const runDatasetIds = ctx.runDatasetIds;
  const expandedDatasetId = ctx.expandedDatasetId;
  const expandedDatasetSnapshots = ctx.expandedDatasetSnapshots;
  const datasetSnapshotsLoading = ctx.datasetSnapshotsLoading;
  const datasetSnapshotsError = ctx.datasetSnapshotsError;
  const datasetSnapshots404 = ctx.datasetSnapshots404;
  const mutateDatasetSnapshots = ctx.mutateDatasetSnapshots;
  const expandedDatasetSnapshotsLoading = ctx.expandedDatasetSnapshotsLoading;
  const expandedDatasetSnapshotsError = ctx.expandedDatasetSnapshotsError;
  const expandedDatasetSnapshots404 = ctx.expandedDatasetSnapshots404;
  const mutateExpandedDatasetSnapshots = ctx.mutateExpandedDatasetSnapshots;
  const selectedBaselineCount = ctx.selectedBaselineCount;
  const selectedDataSummary = ctx.selectedDataSummary;
  const thresholdPreset = ctx.thresholdPreset;
  const failRateMax = Number(ctx.failRateMax ?? 0);
  const flakyRateMax = Number(ctx.flakyRateMax ?? 0);
  const newModel = ctx.newModel;
  const modelSource = ctx.modelSource;
  const replayProvider = String(ctx.replayProvider ?? "")
    .trim()
    .toLowerCase();
  const requestBody = ctx.requestBody;
  const repeatRuns = ctx.repeatRuns;
  const setRepeatRuns = ctx.setRepeatRuns;
  const repeatDropdownOpen = ctx.repeatDropdownOpen;
  const setRepeatDropdownOpen = ctx.setRepeatDropdownOpen;
  const repeatDropdownRef = ctx.repeatDropdownRef;
  const REPEAT_OPTIONS = ctx.REPEAT_OPTIONS;
  const isHeavyRepeat = ctx.isHeavyRepeat;
  const canRunValidate = ctx.canRunValidate;
  const keyBlocked = keysCtx.keyBlocked;
  const keyIssueBlocked = keysCtx.keyIssueBlocked;
  const keyRegistrationMessage = keysCtx.keyRegistrationMessage || "";
  const isValidating = vctx.isValidating;
  const runLocked = vctx.runLocked;
  const activeJobId = vctx.activeJobId ?? null;
  const cancelRequested = vctx.cancelRequested;
  const cancelLocked = vctx.cancelLocked;
  const handleValidate = vctx.handleValidate;
  const handleCancelActiveJob = vctx.handleCancelActiveJob ?? undefined;
  const runError = vctx.error || "";
  const result = vctx.result;
  const completedResults = vctx.completedResults;
  const hasCompletedResults = vctx.hasCompletedResults;
  const dismissResult = vctx.dismissResult;
  const setExpandedCaseIndex = ctx.setExpandedCaseIndex;
  const baselineDetailSnapshot = ctx.baselineDetailSnapshot;
  const agentEvalData = ctx.agentEvalData;
  const runEvalElements = useMemo(
    () => ctx.runEvalElements.map(({ name }) => ({ name })),
    [ctx.runEvalElements]
  );

  const baselineEvalRows = useMemo(() => {
    const snap = baselineDetailSnapshot as unknown as Record<string, unknown> | null;
    if (!snap) return [];
    const checks = snap.eval_checks_result;
    if (!checks || typeof checks !== "object" || Array.isArray(checks)) return [];
    return Object.entries(checks).map(([id, status]) => ({
      id,
      status: String(status),
    }));
  }, [baselineDetailSnapshot]);

  const baselineEvalContextLabel = useMemo(() => {
    const snap = baselineDetailSnapshot as unknown as Record<string, unknown> | null;
    if (!snap) return "Eval result from snapshot capture time.";
    const cur = (agentEvalData as Record<string, unknown> | undefined)?.current_eval_config_version as
      | string
      | undefined;
    const snapVer = snap.eval_config_version as string | undefined;
    const stale = cur && snapVer && snapVer !== cur;
    return stale
      ? "Eval result from snapshot capture time. Eval config has changed since then."
      : "Eval result from snapshot capture time.";
  }, [baselineDetailSnapshot, agentEvalData]);

  const historyStatus = ctx.historyStatus;
  const setHistoryStatus = ctx.setHistoryStatus;
  const setHistoryActivated = ctx.setHistoryActivated;
  const historyTraceId = ctx.historyTraceId;
  const setHistoryTraceId = ctx.setHistoryTraceId;
  const historyDatePreset = ctx.historyDatePreset;
  const setHistoryDatePreset = ctx.setHistoryDatePreset;
  const historyOffset = ctx.historyOffset;
  const setHistoryOffset = ctx.setHistoryOffset;
  const historyLimit = ctx.historyLimit;
  const historyLoading = ctx.historyLoading;
  const historyRefreshing = ctx.historyRefreshing;
  const historyItems = ctx.historyItems;
  const historyTotal = ctx.historyTotal;
  const deletingHistoryReportIds = ctx.deletingHistoryReportIds;
  const deleteHistorySession = ctx.deleteHistorySession;
  const mutateHistory = ctx.mutateHistory;
  const selectedRunId = ctx.selectedRunId;
  const setSelectedRunId = ctx.setSelectedRunId;
  const selectedRunCaseIndex = ctx.selectedRunCaseIndex;
  const setSelectedRunCaseIndex = ctx.setSelectedRunCaseIndex;
  const selectedRunReport = ctx.selectedRunReport;
  const selectedRunReportLoading = ctx.selectedRunReportLoading;
  const selectedRunReportError = ctx.selectedRunReportError;

  const expandedHistoryId = ctx.expandedHistoryId;
  const setExpandedHistoryId = ctx.setExpandedHistoryId;
  const runDataProvider = ctx.runDataProvider;
  const runDataModel = ctx.runDataModel;
  const projectName = project?.name;
  const REPLAY_THRESHOLD_PRESETS = ctx.REPLAY_THRESHOLD_PRESETS;
  const agentId = rawAgentId?.trim() || "";
  const resolvedSelectedAgent = useMemo(
    () =>
      selectedAgent?.agent_id === agentId
        ? selectedAgent
        : agents.find(agent => agent.agent_id === agentId) ?? null,
    [selectedAgent, agentId, agents]
  );
  const [dataPanelTab, setDataPanelTab] = useState<"logs" | "datasets">("logs");
  const [rightPanelTab, setRightPanelTab] = useState<"results" | "history">("results");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [detailAttemptView, setDetailAttemptView] = useState<ExpandedDetailAttemptView>(null);

  useEffect(() => {
    if (rightPanelTab === "history") {
      setHistoryActivated(true);
    }
  }, [rightPanelTab, setHistoryActivated]);

  const resultPanel = useReleaseGateExpandedResultPanel({
    completedResults,
    setDetailAttemptView,
  });

  const { clearHistoryOverlayPending, selectHistoryRun } = useReleaseGateExpandedHistoryOverlay({
    rightPanelTab,
    tab,
    selectedRunId,
    setSelectedRunId,
    selectedRunCaseIndex,
    setSelectedRunCaseIndex,
    selectedRunReport,
    selectedRunReportLoading,
    selectedRunReportError,
    baselineSnapshotsById,
    recentSnapshots,
    setExpandedHistoryId,
    setDetailAttemptView,
  });

  useReleaseGateExpandedAgentReset({
    agentId,
    tab,
    setTab,
    setDataPanelTab,
    setRightPanelTab,
    setResultCaseFilter: resultPanel.setResultCaseFilter,
    setSettingsPanelOpen,
    setDetailAttemptView,
    setExpandedCaseIndex,
    setExpandedHistoryId,
    clearHistoryOverlayPending,
    setSelectedRunId,
    setSelectedRunCaseIndex,
    setRepeatDropdownOpen,
  });

  const logsPanel = useReleaseGateExpandedLogsPanel({
    recentSnapshots,
    baselineSnapshotsById,
    snapshotEvalFailed,
    recentSnapshotsError,
    datasetsError,
    expandedDatasetSnapshots404,
    datasetSnapshots404,
    expandedDatasetSnapshotsError,
    datasetSnapshotsError,
  });

  const nodeHistoryItems = historyItems;
  const historyDateSummary = useMemo(
    () => formatHistoryDateFilterSummary(historyDatePreset),
    [historyDatePreset]
  );
  const historyFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (historyStatus !== "all") parts.push(historyStatus === "pass" ? "Healthy runs" : "Flagged runs");
    if (historyDateSummary) parts.push(historyDateSummary);
    if (historyTraceId.trim()) parts.push(`Trace ${historyTraceId.trim()}`);
    return parts;
  }, [historyDateSummary, historyStatus, historyTraceId]);

  const clearHistorySelectionForReport = useCallback(
    (reportId: string) => {
      const normalizedReportId = String(reportId || "").trim();
      if (!normalizedReportId) return;
      clearHistoryOverlayPending();
      setDetailAttemptView(null);
      setExpandedHistoryId(current =>
        current && current.startsWith(`${normalizedReportId}:`) ? null : current
      );
      if (selectedRunId === normalizedReportId) {
        setSelectedRunId(null);
        setSelectedRunCaseIndex(null);
      }
    },
    [
      clearHistoryOverlayPending,
      selectedRunId,
      setDetailAttemptView,
      setExpandedHistoryId,
      setSelectedRunCaseIndex,
      setSelectedRunId,
    ]
  );

  const handleDeleteHistorySession = useCallback(
    async (reportId: string) => {
      const normalizedReportId = String(reportId || "").trim();
      if (!normalizedReportId) return;
      if (runLocked) return;
      if (selectedRunReportLoading) return;
      if (deletingHistoryReportIds.includes(normalizedReportId)) return;
      if (typeof window !== "undefined") {
        const approved = window.confirm(
          "Delete this validation session? This permanently deletes the retained Release Gate history for this run."
        );
        if (!approved) return;
      }
      clearHistorySelectionForReport(normalizedReportId);
      try {
        const response = await deleteHistorySession(normalizedReportId);
        if (response.deleted) {
          toast.showToast("Validation session deleted.", "success");
        } else {
          toast.showToast("Validation session was already deleted.", "info");
        }
      } catch (e: any) {
        const message =
          e?.response?.data?.detail ||
          e?.message ||
          "Failed to delete validation session.";
        toast.showToast(String(message), "error");
      }
    },
    [
      clearHistorySelectionForReport,
      deleteHistorySession,
      deletingHistoryReportIds,
      runLocked,
      selectedRunReportLoading,
      toast,
    ]
  );

  const handleBack = useCallback(() => {
    setViewMode("map");
    setAgentId("");
    setSelectedAgent(null);
    setDatasetIds([]);
    setSnapshotIds([]);
    setRunSnapshotIds([]);
    setRunDatasetIds([]);
    setExpandedDatasetId(null);
    setDetailAttemptView(null);
    setExpandedCaseIndex(null);
    clearHistoryOverlayPending();
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  }, [
    setViewMode,
    setAgentId,
    setSelectedAgent,
    setDatasetIds,
    setSnapshotIds,
    setRunSnapshotIds,
    setRunDatasetIds,
    setExpandedDatasetId,
    setDetailAttemptView,
    setExpandedCaseIndex,
    clearHistoryOverlayPending,
    setSelectedRunId,
    setRepeatDropdownOpen,
  ]);

  const handleRepeatSelect = useCallback((runs: number) => {
    if (isValidating || activeJobId) return;
    if ((runs === 50 || runs === 100) && typeof window !== "undefined") {
      const approved = window.confirm(
        `${runs}x repeat runs are heavier and slower. Continue with the stability check?`
      );
      if (!approved) return;
    }
    setRepeatRuns(runs);
    setRepeatDropdownOpen(false);
  }, [isValidating, activeJobId, setRepeatRuns, setRepeatDropdownOpen]);

  const restorationBadgesBySnapshotId = useMemo(() => {
    const m = new Map<string, { body: boolean; ctx: boolean; sharedCtx: boolean }>();
    for (const sid of selectedSnapshotIdsForRun) {
      const body = snapshotHasPerLogBodyOverride(
        sid,
        requestBodyOverridesBySnapshotId,
        bodyOverridesSnapshotDraftRaw
      );
      const perCtx =
        toolContextMode === "inject" &&
        toolContextScope === "per_snapshot" &&
        Boolean(toolContextBySnapshotId[sid]?.trim());
      const sharedCtx =
        toolContextMode === "inject" &&
        toolContextScope === "global" &&
        toolContextGlobalText.trim().length > 0;
      m.set(sid, { body, ctx: perCtx, sharedCtx });
    }
    return m;
  }, [
    selectedSnapshotIdsForRun,
    requestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw,
    toolContextMode,
    toolContextScope,
    toolContextGlobalText,
    toolContextBySnapshotId,
  ]);

  const rgDetails = useMemo(
    () =>
      buildReleaseGateMapRgDetails({
        agentId,
        runDataProvider,
        runDataModel,
        requestSystemPrompt,
        runDataPrompt,
        requestBody,
        runEvalElements,
        agentEvalData: agentEvalData as Record<string, unknown> | undefined,
        thresholdPreset,
        REPLAY_THRESHOLD_PRESETS: REPLAY_THRESHOLD_PRESETS as Record<string, { label: string }>,
        failRateMax,
        flakyRateMax,
        baselinePayload,
        baselineSeedSnapshot: baselineSeedSnapshot as Record<string, unknown> | null,
        nodeBasePayload,
        result,
        isValidating,
        cancelRequested,
        cancelLocked,
        runError,
        configSourceLabel,
        selectedBaselineCount,
        selectedDataSummary,
        modelSource,
        replayProvider,
        newModel,
        repeatRuns,
        repeatDropdownOpen,
        setRepeatDropdownOpen,
        repeatDropdownRef,
        REPEAT_OPTIONS,
        isHeavyRepeat,
        canRunValidate,
        keyBlocked,
        keyIssueBlocked,
        keyRegistrationMessage,
        handleValidate,
        runLocked,
        activeJobId,
        handleCancelActiveJob,
        handleRepeatSelect,
        openSettings: () => setSettingsPanelOpen(true),
      }),
    [
      agentId,
      runDataProvider,
      runDataModel,
      requestSystemPrompt,
      runDataPrompt,
      requestBody,
      runEvalElements,
      agentEvalData,
      thresholdPreset,
      REPLAY_THRESHOLD_PRESETS,
      failRateMax,
      flakyRateMax,
      baselinePayload,
      baselineSeedSnapshot,
      nodeBasePayload,
      result,
      isValidating,
      cancelRequested,
      cancelLocked,
      runError,
      configSourceLabel,
      selectedBaselineCount,
      selectedDataSummary,
      modelSource,
      replayProvider,
      newModel,
      repeatRuns,
      repeatDropdownOpen,
      setRepeatDropdownOpen,
      repeatDropdownRef,
      REPEAT_OPTIONS,
      isHeavyRepeat,
      canRunValidate,
      keyBlocked,
      keyIssueBlocked,
      keyRegistrationMessage,
      handleValidate,
      runLocked,
      activeJobId,
      handleCancelActiveJob,
      handleRepeatSelect,
      setSettingsPanelOpen,
    ]
  );

  return {
    agentId,
    agents,
    agentsLoaded,
    baselineDetailSnapshot,
    baselineEvalContextLabel,
    baselineEvalRows,
    baselineSnapshotsById,
    dataPanelTab,
    dataSource,
    datasetSnapshots404,
    datasetSnapshotsLoading,
    datasets,
    datasetsError,
    datasetsLoading,
    detailAttemptView,
    expandedDatasetId,
    expandedDatasetSnapshots,
    expandedDatasetSnapshots404,
    expandedDatasetSnapshotsLoading,
    handleBack,
    historyDatePreset,
    historyDateSummary,
    historyFilterSummary,
    historyItems,
    historyLimit,
    historyLoading,
    historyOffset,
    historyRefreshing,
    historyStatus,
    historyTotal,
    historyTraceId,
    deletingHistoryReportIds,
    handleDeleteHistorySession,
    mutateDatasetSnapshots,
    mutateDatasets,
    mutateExpandedDatasetSnapshots,
    mutateHistory,
    mutateRecentSnapshots,
    nodeHistoryItems,
    onMapSelectAgent,
    openBaselineDetailSnapshot,
    orgId,
    projectId,
    projectName,
    recentSnapshots,
    recentSnapshotsError,
    recentSnapshotsLoading,
    recentSnapshotsTotalAvailable,
    repeatRuns,
    restorationBadgesBySnapshotId,
    result,
    completedResults,
    hasCompletedResults,
    dismissResult,
    rgDetails,
    rightPanelTab,
    runDatasetIds,
    runLocked,
    runSnapshotIds,
    selectHistoryRun,
    expandedHistoryId,
    selectedAgent: resolvedSelectedAgent,
    selectedRunId,
    selectedRunReportLoading,
    setBaselineDetailSnapshot,
    setDataPanelTab,
    setDataSource,
    setDetailAttemptView,
    setExpandedDatasetId,
    setHistoryDatePreset,
    setHistoryOffset,
    setHistoryStatus,
    setHistoryTraceId,
    setRightPanelTab,
    setRunDatasetIds,
    setRunSnapshotIds,
    setSettingsPanelOpen,
    setTab,
    settingsPanelOpen,
    snapshotEvalFailed,
    tab,
    ...resultPanel,
    ...logsPanel,
  };
}
