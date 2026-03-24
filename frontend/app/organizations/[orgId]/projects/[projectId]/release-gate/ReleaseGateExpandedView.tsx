"use client";

/**
 * Release Gate run / attempt UI. Tool timeline rows mirror Live View (`LiveViewToolTimelineRow`);
 * keep redaction and empty-state copy aligned with `SnapshotDetailModal` / `ToolTimelinePanel`
 * (see docs/live-view-context-privacy-plan.md).
 */
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { ReleaseGateValidateRunContext } from "./ReleaseGateValidateRunContext";
import { ReleaseGateExpandedBaselineDetailPortal } from "./ReleaseGateExpandedBaselineDetailPortal";
import { ReleaseGateExpandedMainTabs } from "./ReleaseGateExpandedMainTabs";
import { sanitizePayloadForPreview } from "./releaseGatePageContent.lib";
import { ReleaseGateConfigPanel } from "./ReleaseGateConfigPanel";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import { AttemptDetailOverlay } from "@/components/release-gate/AttemptDetailOverlay";
import { ReleaseGateHistoryExplorer } from "@/components/release-gate/ReleaseGateHistoryExplorer";
import { ReleaseGateRunDataSidePanel } from "@/components/release-gate/ReleaseGateRunDataSidePanel";
import { ReleaseGateRunOutputSidePanel } from "@/components/release-gate/ReleaseGateRunOutputSidePanel";
import { ClientPortal } from "@/components/shared/ClientPortal";
import {
  type GateTab,
  type ThresholdPreset,
  type ResultCaseFilter,
  type LogsStatusFilter,
  type VisibleResultCase,
  EVAL_CHECK_LABELS,
  isCasePassing,
  buildWhatToFixHints,
  summarizeRunToolGroundingFromCases,
  getEvalCheckParams,
  getCasesFromReport,
  findFirstCaseWithAttempts,
} from "./releaseGateExpandedHelpers";
import {
  extractErrorMessage,
  formatHistoryDateFilterSummary,
  snapshotHasPerLogBodyOverride,
} from "./releaseGateViewUtils";

export function ReleaseGateExpandedView() {
  const ctx = useContext(ReleaseGatePageContext);
  const vctx = useContext(ReleaseGateValidateRunContext);
  if (!ctx || !vctx) {
    throw new Error(
      "ReleaseGateExpandedView must render inside ReleaseGateValidateRunContext and ReleaseGatePageContext providers"
    );
  }

  const orgId = ctx.orgId;
  const projectId = ctx.projectId;
  const project = ctx.project;
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
  const setThresholdPreset = ctx.setThresholdPreset;
  const normalizeGateThresholds = ctx.normalizeGateThresholds;
  const failRateMax = Number(ctx.failRateMax ?? 0);
  const setFailRateMax = ctx.setFailRateMax;
  const flakyRateMax = Number(ctx.flakyRateMax ?? 0);
  const setFlakyRateMax = ctx.setFlakyRateMax;
  const newModel = ctx.newModel;
  const setNewModel = ctx.setNewModel;
  const modelOverrideEnabled = ctx.modelOverrideEnabled;
  const setModelOverrideEnabled = ctx.setModelOverrideEnabled;
  const replayProvider = String(ctx.replayProvider ?? "")
    .trim()
    .toLowerCase();
  const requestBody = ctx.requestBody;
  const setRequestBody = ctx.setRequestBody;
  const applySystemPromptToBody = ctx.applySystemPromptToBody;
  const repeatRuns = ctx.repeatRuns;
  const setRepeatRuns = ctx.setRepeatRuns;
  const repeatDropdownOpen = ctx.repeatDropdownOpen;
  const setRepeatDropdownOpen = ctx.setRepeatDropdownOpen;
  const repeatDropdownRef = ctx.repeatDropdownRef;
  const REPEAT_OPTIONS = ctx.REPEAT_OPTIONS;
  const isHeavyRepeat = ctx.isHeavyRepeat;
  const canRunValidate = ctx.canRunValidate;
  const keyBlocked = ctx.keyBlocked;
  const keyRegistrationMessage = ctx.keyRegistrationMessage || "";
  const isValidating = vctx.isValidating;
  const activeJobId = vctx.activeJobId ?? null;
  const cancelRequested = vctx.cancelRequested;
  const handleValidate = vctx.handleValidate;
  const handleCancelActiveJob = vctx.handleCancelActiveJob ?? undefined;
  const runError = vctx.error || "";
  const result = vctx.result;
  const expandedCaseIndex = ctx.expandedCaseIndex;
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
  const mutateHistory = ctx.mutateHistory;
  const selectedRunId = ctx.selectedRunId;
  const setSelectedRunId = ctx.setSelectedRunId;
  const selectedRunReport = ctx.selectedRunReport;
  const selectedRunReportLoading = ctx.selectedRunReportLoading;
  const selectedRunReportError = ctx.selectedRunReportError;

  const setExpandedHistoryId = ctx.setExpandedHistoryId;
  const runDataProvider = ctx.runDataProvider;
  const runDataModel = ctx.runDataModel;
  const projectName = project?.name;
  const REPLAY_THRESHOLD_PRESETS = ctx.REPLAY_THRESHOLD_PRESETS;

  const agentId = selectedAgent?.agent_id ?? "";
  const [dataPanelTab, setDataPanelTab] = useState<"logs" | "datasets">("logs");
  const [rightPanelTab, setRightPanelTab] = useState<"results" | "history">("results");
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [resultCaseFilter, setResultCaseFilter] = useState<ResultCaseFilter>("all");
  const [detailAttemptView, setDetailAttemptView] = useState<{
    attempts: any[];
    caseIndex: number;
    initialAttemptIndex: number;
    baselineSnapshot: Record<string, unknown> | null;
  } | null>(null);
  const historyOverlayPendingRunIdRef = useRef<string | null>(null);

  const [logsStatusFilter, setLogsStatusFilter] = useState<LogsStatusFilter>("all");
  const [logsSortMode, setLogsSortMode] = useState<"newest" | "oldest">("newest");
  const [logsShowLimit, setLogsShowLimit] = useState<10 | 20 | 30 | 50 | 100 | 200>(30);
  const requestTools = useMemo(
    () => (Array.isArray(requestBody.tools) ? requestBody.tools : []),
    [requestBody]
  );
  const resultCases = useMemo(() => {
    if (Array.isArray(result?.run_results)) return result.run_results;
    if (Array.isArray(result?.case_results)) return result.case_results;
    return [];
  }, [result]);
  const failedCaseCount = useMemo(
    () => resultCases.filter((run: any) => !isCasePassing(run)).length,
    [resultCases]
  );
  const visibleResultCases = useMemo(
    () =>
      resultCases
        .map((run: any, caseIndex: number) => ({ run, caseIndex }))
        .filter(({ run }: VisibleResultCase) => (resultCaseFilter === "all" ? true : !isCasePassing(run))),
    [resultCases, resultCaseFilter]
  );
  const whatToFixHints = useMemo(() => buildWhatToFixHints(result, resultCases), [result, resultCases]);
  const toolGroundingRunSummary = useMemo(
    () => summarizeRunToolGroundingFromCases(resultCases),
    [resultCases]
  );
  const nodeHistoryItems = useMemo(
    () =>
      historyItems.filter(item => {
        const itemAgentId = String(item?.agent_id ?? "").trim();
        return !itemAgentId || itemAgentId === agentId;
      }),
    [agentId, historyItems]
  );
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
  const recentSnapshotsErrorMessage = useMemo(
    () =>
      recentSnapshotsError
        ? extractErrorMessage(
            recentSnapshotsError,
            "Unable to load recent snapshots right now. Retry in a few seconds."
          )
        : "",
    [recentSnapshotsError]
  );
  const datasetsErrorMessage = useMemo(
    () =>
      datasetsError
        ? extractErrorMessage(datasetsError, "Unable to load saved datasets right now. Please retry.")
        : "",
    [datasetsError]
  );
  const expandedDatasetErrorMessage = useMemo(() => {
    if (expandedDatasetSnapshots404 || datasetSnapshots404) {
      return "This dataset is no longer available (it may have been deleted).";
    }
    if (expandedDatasetSnapshotsError) {
      return extractErrorMessage(
        expandedDatasetSnapshotsError,
        "Unable to load snapshots in this dataset right now. Please retry."
      );
    }
    if (datasetSnapshotsError) {
      return extractErrorMessage(
        datasetSnapshotsError,
        "Unable to resolve dataset snapshots for this run. Please retry."
      );
    }
    return "";
  }, [
    expandedDatasetSnapshots404,
    datasetSnapshots404,
    expandedDatasetSnapshotsError,
    datasetSnapshotsError,
  ]);

  const logsFilteredSorted = useMemo(() => {
    const items = Array.isArray(recentSnapshots) ? [...recentSnapshots] : [];
    const filtered = items.filter(item => {
      const rowId = String((item as { id?: unknown })?.id ?? "");
      const full =
        (rowId ? baselineSnapshotsById.get(rowId) : undefined) ??
        (item as Record<string, unknown>);
      if (logsStatusFilter === "all") return true;
      const failed = snapshotEvalFailed(full);
      if (logsStatusFilter === "failed") return failed;
      return !failed;
    });
    filtered.sort((a, b) => {
      const aTime = a?.created_at ? new Date(String(a.created_at)).getTime() : 0;
      const bTime = b?.created_at ? new Date(String(b.created_at)).getTime() : 0;
      return logsSortMode === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return filtered;
  }, [
    baselineSnapshotsById,
    logsSortMode,
    logsStatusFilter,
    recentSnapshots,
    snapshotEvalFailed,
  ]);

  const logsMatchCount = logsFilteredSorted.length;

  const filteredRecentSnapshots = useMemo(
    () => logsFilteredSorted.slice(0, logsShowLimit),
    [logsFilteredSorted, logsShowLimit]
  );

  useEffect(() => {
    setDataPanelTab("logs");
    setRightPanelTab("results");
    setResultCaseFilter("all");
    setSettingsPanelOpen(false);
    setDetailAttemptView(null);
    setExpandedCaseIndex(null);
    historyOverlayPendingRunIdRef.current = null;
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  }, [
    agentId,
    setExpandedCaseIndex,
    setRepeatDropdownOpen,
    setSelectedRunId,
  ]);

  useEffect(() => {
    if (rightPanelTab !== "history" && tab !== "history") {
      historyOverlayPendingRunIdRef.current = null;
    }
  }, [rightPanelTab, tab]);

  useEffect(() => {
    if (!historyOverlayPendingRunIdRef.current || selectedRunReportLoading) return;
    if (selectedRunReportError) {
      historyOverlayPendingRunIdRef.current = null;
      setSelectedRunId(null);
    }
  }, [selectedRunReportLoading, selectedRunReportError, setSelectedRunId]);

  useEffect(() => {
    const pending = historyOverlayPendingRunIdRef.current;
    if (!pending || String(pending) !== String(selectedRunId ?? "")) return;
    if (selectedRunReportLoading || !selectedRunReport) return;
    const reportObj = selectedRunReport as Record<string, unknown>;
    if (String(reportObj.id) !== String(selectedRunId)) return;
    const historyUiActive = rightPanelTab === "history" || tab === "history";
    if (!historyUiActive) return;

    const cases = getCasesFromReport(selectedRunReport);
    const picked = findFirstCaseWithAttempts(cases);
    historyOverlayPendingRunIdRef.current = null;

    if (!picked || !Array.isArray(picked.run?.attempts) || picked.run.attempts.length === 0) {
      setSelectedRunId(null);
      return;
    }

    const { run, caseIndex } = picked;
    const baselineSnapshotForRun =
      (baselineSnapshotsById.get(String(run?.snapshot_id ?? "")) as
        | Record<string, unknown>
        | undefined) ??
      (recentSnapshots.find(
        s =>
          String((s as Record<string, unknown>)?.id ?? "") === String(run?.snapshot_id ?? "")
      ) as Record<string, unknown> | undefined) ??
      null;

    setDetailAttemptView({
      attempts: run.attempts,
      caseIndex,
      initialAttemptIndex: 0,
      baselineSnapshot: baselineSnapshotForRun,
    });
    setSelectedRunId(null);
  }, [
    selectedRunReport,
    selectedRunId,
    selectedRunReportLoading,
    rightPanelTab,
    tab,
    baselineSnapshotsById,
    recentSnapshots,
    setSelectedRunId,
  ]);

  useEffect(() => {
    setResultCaseFilter("all");
    setDetailAttemptView(null);
  }, [result?.report_id]);

  const handleBack = () => {
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
    historyOverlayPendingRunIdRef.current = null;
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  };

  const selectHistoryRun = (id: string) => {
    historyOverlayPendingRunIdRef.current = id;
    setSelectedRunId(id);
    setExpandedHistoryId(id);
  };

  const handleRepeatSelect = (runs: number) => {
    if (isValidating || activeJobId) return;
    if ((runs === 50 || runs === 100) && typeof window !== "undefined") {
      const approved = window.confirm(
        `${runs}x repeat runs are heavier and slower. Continue with the stability check?`
      );
      if (!approved) return;
    }
    setRepeatRuns(runs);
    setRepeatDropdownOpen(false);
  };

  const runLocked = isValidating || Boolean(activeJobId);

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

  const activeChecksCards = useMemo(() => {
    const configSrc = agentEvalData?.config as Record<string, unknown> | undefined;
    return runEvalElements.map((e: { name: string }) => {
      const id = e.name;
      const label =
        EVAL_CHECK_LABELS[id] ??
        id.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
      const checkConfig = configSrc?.[id] as Record<string, unknown> | undefined;
      const params = getEvalCheckParams(id, checkConfig);
      return { id, label, params };
    });
  }, [agentEvalData?.config, runEvalElements]);

  const toolsCount = Array.isArray(requestTools) ? requestTools.length : 0;
  const samplingTemperature =
    typeof (requestBody as any)?.temperature === "number"
      ? (requestBody as any).temperature
      : undefined;
  const samplingMaxTokens =
    typeof (requestBody as any)?.max_tokens === "number"
      ? (requestBody as any).max_tokens
      : undefined;
  const samplingTopP =
    typeof (requestBody as any)?.top_p === "number" ? (requestBody as any).top_p : undefined;
  const samplingSummary =
    samplingTemperature == null && samplingMaxTokens == null && samplingTopP == null
      ? "Using provider defaults"
      : [
          samplingTemperature != null ? `Temp ${samplingTemperature}` : null,
          samplingMaxTokens != null ? `Max ${samplingMaxTokens}` : null,
          samplingTopP != null ? `Top p ${samplingTopP}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const toolsSummary =
    toolsCount > 0
      ? `${toolsCount} tool${toolsCount === 1 ? "" : "s"} configured`
      : "No tools configured";
  const isPinnedAnthropic = (modelId: unknown) => /-\d{8}$/.test(String(modelId ?? "").trim());
  const overrideSummary = modelOverrideEnabled
    ? (() => {
        // This summary is displayed on the node card, so keep it compact.
        if (replayProvider === "anthropic") {
          return isPinnedAnthropic(newModel) ? "Pinned override" : "Custom override";
        }
        return "Override active";
      })()
    : "Using detected model";
  const lastRunStatusLabel = useMemo(() => {
    if (isValidating) return cancelRequested ? "Canceling" : "Running";
    if (runError) return "Failed";
    if (typeof result?.pass === "boolean") return result.pass ? "Healthy" : "Flagged";
    return "";
  }, [isValidating, cancelRequested, runError, result]);
  const originalPayloadPreview = useMemo(() => {
    const rawSource =
      baselinePayload ??
      (baselineSeedSnapshot?.payload &&
      typeof baselineSeedSnapshot.payload === "object" &&
      !Array.isArray(baselineSeedSnapshot.payload)
        ? (baselineSeedSnapshot.payload as Record<string, unknown>)
        : null) ??
      nodeBasePayload;
    const clean = sanitizePayloadForPreview(rawSource);
    try {
      return JSON.stringify(clean, null, 2);
    } catch {
      return "{}";
    }
  }, [baselinePayload, baselineSeedSnapshot, nodeBasePayload]);

  const rgDetails = agentId
    ? {
        provider: runDataProvider,
        model: runDataModel,
        prompt: String(requestSystemPrompt || runDataPrompt || "").trim(),
        toolsCount,
        activeChecks: runEvalElements.map((e: { name: string }) => e.name),
        activeChecksCards,
        strictnessLabel: REPLAY_THRESHOLD_PRESETS[thresholdPreset]?.label ?? thresholdPreset,
        failRateMax,
        flakyRateMax,
        config: {
          lastRunWallMs: result?.perf?.total_wall_ms ?? null,
          lastRunStatusLabel,
          configSourceLabel,
          selectedBaselineCount,
          selectedDataSummary,
          samplingSummary,
          toolsSummary,
          overrideSummary,
          originalPayloadPreview,
          runError,
          repeatRuns,
          repeatDropdownOpen,
          setRepeatDropdownOpen,
          repeatDropdownRef,
          REPEAT_OPTIONS,
          isHeavyRepeat,
          canRunValidate,
          keyBlocked,
          keyRegistrationMessage,
          isValidating,
          handleValidate,
          activeJobId,
          cancelRequested,
          handleCancel: handleCancelActiveJob,
          handleRepeatSelect,
          modelOverrideEnabled,
          openSettings: () => setSettingsPanelOpen(true),
        },
      }
    : null;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="absolute inset-0">
        <ReleaseGateMap
          agents={agents}
          agentsLoaded={agentsLoaded}
          onSelectAgent={onMapSelectAgent}
          projectName={projectName}
          selectedNodeId={agentId || null}
          rgDetails={rgDetails}
        />
      </div>
      <div className="absolute inset-0 z-[9999] pointer-events-none overflow-y-auto">
        <ReleaseGateExpandedMainTabs tab={tab} setTab={setTab} />

        {agentId && (
          <ClientPortal>
            <ReleaseGateRunDataSidePanel
              leftPanelTitle={selectedAgent?.display_name || agentId}
              validatePanelOpen={tab === "validate"}
              onClose={handleBack}
              orgId={orgId}
              projectId={projectId}
              dataPanelTab={dataPanelTab}
              setDataPanelTab={setDataPanelTab}
              filteredRecentSnapshots={filteredRecentSnapshots}
              logsMatchCount={logsMatchCount}
              logsShowLimit={logsShowLimit}
              setLogsShowLimit={setLogsShowLimit}
              recentSnapshotsTotalAvailable={recentSnapshotsTotalAvailable}
              recentSnapshots={recentSnapshots}
              dataSource={dataSource}
              runDatasetIds={runDatasetIds}
              runSnapshotIds={runSnapshotIds}
              setLogsStatusFilter={setLogsStatusFilter}
              logsStatusFilter={logsStatusFilter}
              logsSortMode={logsSortMode}
              setLogsSortMode={setLogsSortMode}
              recentSnapshotsError={recentSnapshotsError}
              recentSnapshotsErrorMessage={recentSnapshotsErrorMessage}
              mutateRecentSnapshots={mutateRecentSnapshots}
              recentSnapshotsLoading={recentSnapshotsLoading}
              runLocked={runLocked}
              baselineSnapshotsById={baselineSnapshotsById}
              setRunSnapshotIds={setRunSnapshotIds}
              snapshotEvalFailed={snapshotEvalFailed}
              restorationBadgesBySnapshotId={restorationBadgesBySnapshotId}
              openBaselineDetailSnapshot={openBaselineDetailSnapshot}
              setDataSource={setDataSource}
              setRunDatasetIds={setRunDatasetIds}
              datasetsError={datasetsError}
              datasetsErrorMessage={datasetsErrorMessage}
              mutateDatasets={mutateDatasets}
              datasetsLoading={datasetsLoading}
              datasets={datasets}
              expandedDatasetId={expandedDatasetId}
              setExpandedDatasetId={setExpandedDatasetId}
              expandedDatasetSnapshotsLoading={expandedDatasetSnapshotsLoading}
              datasetSnapshotsLoading={datasetSnapshotsLoading}
              expandedDatasetErrorMessage={expandedDatasetErrorMessage}
              expandedDatasetSnapshots404={expandedDatasetSnapshots404}
              datasetSnapshots404={datasetSnapshots404}
              mutateExpandedDatasetSnapshots={mutateExpandedDatasetSnapshots}
              mutateDatasetSnapshots={mutateDatasetSnapshots}
              expandedDatasetSnapshots={expandedDatasetSnapshots}
            />
            <ReleaseGateRunOutputSidePanel
              onClose={handleBack}
              rightPanelTab={rightPanelTab}
              setRightPanelTab={setRightPanelTab}
              result={result}
              repeatRuns={repeatRuns}
              toolGroundingRunSummary={toolGroundingRunSummary}
              whatToFixHints={whatToFixHints}
              resultCaseFilter={resultCaseFilter}
              setResultCaseFilter={setResultCaseFilter}
              visibleResultCases={visibleResultCases}
              baselineSnapshotsById={baselineSnapshotsById}
              recentSnapshots={recentSnapshots}
              setDetailAttemptView={setDetailAttemptView}
              historyLoading={historyLoading}
              nodeHistoryItems={nodeHistoryItems}
              historyTotal={historyTotal}
              historyFilterSummary={historyFilterSummary}
              historyStatus={historyStatus}
              setHistoryStatus={setHistoryStatus}
              setHistoryOffset={setHistoryOffset}
              historyDatePreset={historyDatePreset}
              setHistoryDatePreset={setHistoryDatePreset}
              historyRefreshing={historyRefreshing}
              mutateHistory={mutateHistory}
              selectedRunId={selectedRunId}
              selectedRunReportLoading={selectedRunReportLoading}
              selectHistoryRun={selectHistoryRun}
            />
          </ClientPortal>
        )}

        {detailAttemptView && (
          <ClientPortal>
            <AttemptDetailOverlay
              open={Boolean(detailAttemptView)}
              onClose={() => setDetailAttemptView(null)}
              inputIndex={detailAttemptView.caseIndex}
              attempts={detailAttemptView.attempts}
              initialAttemptIndex={detailAttemptView.initialAttemptIndex}
              baselineSnapshot={detailAttemptView.baselineSnapshot}
            />
          </ClientPortal>
        )}

        <ReleaseGateConfigPanel
          isOpen={settingsPanelOpen && !!agentId}
          onClose={() => setSettingsPanelOpen(false)}
        />

        {tab === "history" && (
          <ReleaseGateHistoryExplorer
            historyStatus={historyStatus}
            setHistoryStatus={setHistoryStatus}
            historyDatePreset={historyDatePreset}
            setHistoryDatePreset={setHistoryDatePreset}
            historyTraceId={historyTraceId}
            setHistoryTraceId={setHistoryTraceId}
            historyRefreshing={historyRefreshing}
            mutateHistory={mutateHistory}
            historyDateSummary={historyDateSummary}
            historyLoading={historyLoading}
            historyItems={historyItems}
            historyTotal={historyTotal}
            selectedRunId={selectedRunId}
            selectedRunReportLoading={selectedRunReportLoading}
            selectHistoryRun={selectHistoryRun}
            historyOffset={historyOffset}
            historyLimit={historyLimit}
            setHistoryOffset={setHistoryOffset}
          />
        )}

        <ReleaseGateExpandedBaselineDetailPortal
          baselineDetailSnapshot={baselineDetailSnapshot}
          onClose={() => setBaselineDetailSnapshot(null)}
          evalRows={baselineEvalRows}
          evalContextLabel={baselineEvalContextLabel}
        />
      </div>
    </div>
  );
}
