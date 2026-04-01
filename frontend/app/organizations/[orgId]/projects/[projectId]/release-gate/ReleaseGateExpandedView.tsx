"use client";

/**
 * Release Gate run / attempt UI. Tool timeline rows mirror Live View (`LiveViewToolTimelineRow`);
 * keep redaction and empty-state copy aligned with `SnapshotDetailModal` / `ToolTimelinePanel`
 * (see docs/live-view-context-privacy-plan.md).
 */
import React, { useContext } from "react";
import { ReleaseGateKeysContext } from "./ReleaseGateKeysContext";
import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { ReleaseGateValidateRunContext } from "./ReleaseGateValidateRunContext";
import { ReleaseGateExpandedBaselineDetailPortal } from "./ReleaseGateExpandedBaselineDetailPortal";
import { ReleaseGateExpandedMainTabs } from "./ReleaseGateExpandedMainTabs";
import { ReleaseGateConfigPanel } from "./ReleaseGateConfigPanel";
import { useReleaseGateExpandedViewModel } from "./useReleaseGateExpandedViewModel";
import { ReleaseGateMap } from "@/components/release-gate/ReleaseGateMap";
import { AttemptDetailOverlay } from "@/components/release-gate/AttemptDetailOverlay";
import { ReleaseGateHistoryExplorer } from "@/components/release-gate/ReleaseGateHistoryExplorer";
import { ReleaseGateRunDataSidePanel } from "@/components/release-gate/ReleaseGateRunDataSidePanel";
import { ReleaseGateRunOutputSidePanel } from "@/components/release-gate/ReleaseGateRunOutputSidePanel";
import { ClientPortal } from "@/components/shared/ClientPortal";

export function ReleaseGateExpandedView() {
  const ctx = useContext(ReleaseGatePageContext);
  const vctx = useContext(ReleaseGateValidateRunContext);
  const keysCtx = useContext(ReleaseGateKeysContext);
  if (!ctx || !vctx || !keysCtx) {
    throw new Error(
      "ReleaseGateExpandedView must render inside ReleaseGateKeysContext, ReleaseGateValidateRunContext, and ReleaseGatePageContext providers"
    );
  }

  const m = useReleaseGateExpandedViewModel({ ctx, vctx, keysCtx });

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div className="absolute inset-0">
        <ReleaseGateMap
          agents={m.agents}
          agentsLoaded={m.agentsLoaded}
          onSelectAgent={m.onMapSelectAgent}
          projectId={m.projectId}
          projectName={m.projectName}
          selectedNodeId={m.agentId || null}
          rgDetails={m.rgDetails}
        />
      </div>
      <div className="absolute inset-0 z-[9999] pointer-events-none overflow-y-auto">
        <ReleaseGateExpandedMainTabs tab={m.tab} setTab={m.setTab} />

        {m.agentId && (
          <ClientPortal>
            <ReleaseGateRunDataSidePanel
              leftPanelTitle={m.selectedAgent?.display_name || m.agentId}
              validatePanelOpen={m.tab === "validate"}
              onClose={m.handleBack}
              orgId={m.orgId}
              projectId={m.projectId}
              dataPanelTab={m.dataPanelTab}
              setDataPanelTab={m.setDataPanelTab}
              filteredRecentSnapshots={m.filteredRecentSnapshots}
              logsMatchCount={m.logsMatchCount}
              logsShowLimit={m.logsShowLimit}
              setLogsShowLimit={m.setLogsShowLimit}
              recentSnapshotsTotalAvailable={m.recentSnapshotsTotalAvailable}
              recentSnapshots={m.recentSnapshots}
              dataSource={m.dataSource}
              runDatasetIds={m.runDatasetIds}
              runSnapshotIds={m.runSnapshotIds}
              setLogsStatusFilter={m.setLogsStatusFilter}
              logsStatusFilter={m.logsStatusFilter}
              logsSortMode={m.logsSortMode}
              setLogsSortMode={m.setLogsSortMode}
              recentSnapshotsError={m.recentSnapshotsError}
              recentSnapshotsErrorMessage={m.recentSnapshotsErrorMessage}
              mutateRecentSnapshots={m.mutateRecentSnapshots}
              recentSnapshotsLoading={m.recentSnapshotsLoading}
              runLocked={m.runLocked}
              baselineSnapshotsById={m.baselineSnapshotsById}
              setRunSnapshotIds={m.setRunSnapshotIds}
              snapshotEvalFailed={m.snapshotEvalFailed}
              restorationBadgesBySnapshotId={m.restorationBadgesBySnapshotId}
              openBaselineDetailSnapshot={m.openBaselineDetailSnapshot}
              setDataSource={m.setDataSource}
              setRunDatasetIds={m.setRunDatasetIds}
              datasetsError={m.datasetsError}
              datasetsErrorMessage={m.datasetsErrorMessage}
              mutateDatasets={m.mutateDatasets}
              datasetsLoading={m.datasetsLoading}
              datasets={m.datasets}
              expandedDatasetId={m.expandedDatasetId}
              setExpandedDatasetId={m.setExpandedDatasetId}
              expandedDatasetSnapshotsLoading={m.expandedDatasetSnapshotsLoading}
              datasetSnapshotsLoading={m.datasetSnapshotsLoading}
              expandedDatasetErrorMessage={m.expandedDatasetErrorMessage}
              expandedDatasetSnapshots404={m.expandedDatasetSnapshots404}
              datasetSnapshots404={m.datasetSnapshots404}
              mutateExpandedDatasetSnapshots={m.mutateExpandedDatasetSnapshots}
              mutateDatasetSnapshots={m.mutateDatasetSnapshots}
              expandedDatasetSnapshots={m.expandedDatasetSnapshots}
            />
            <ReleaseGateRunOutputSidePanel
              onClose={m.handleBack}
              rightPanelTab={m.rightPanelTab}
              setRightPanelTab={m.setRightPanelTab}
              result={m.result}
              repeatRuns={m.repeatRuns}
              toolGroundingRunSummary={m.toolGroundingRunSummary}
              whatToFixHints={m.whatToFixHints}
              resultCaseFilter={m.resultCaseFilter}
              setResultCaseFilter={m.setResultCaseFilter}
              visibleResultCases={m.visibleResultCases}
              baselineSnapshotsById={m.baselineSnapshotsById}
              recentSnapshots={m.recentSnapshots}
              setDetailAttemptView={m.setDetailAttemptView}
              historyLoading={m.historyLoading}
              nodeHistoryItems={m.nodeHistoryItems}
              historyTotal={m.historyTotal}
              historyFilterSummary={m.historyFilterSummary}
              historyStatus={m.historyStatus}
              setHistoryStatus={m.setHistoryStatus}
              setHistoryOffset={m.setHistoryOffset}
              historyDatePreset={m.historyDatePreset}
              setHistoryDatePreset={m.setHistoryDatePreset}
              historyRefreshing={m.historyRefreshing}
              mutateHistory={m.mutateHistory}
              historyTraceId={m.historyTraceId}
              selectedRunId={m.selectedRunId}
              selectedRunReportLoading={m.selectedRunReportLoading}
              selectHistoryRun={m.selectHistoryRun}
            />
          </ClientPortal>
        )}

        {m.detailAttemptView && (
          <ClientPortal>
            <AttemptDetailOverlay
              open={Boolean(m.detailAttemptView)}
              onClose={() => m.setDetailAttemptView(null)}
              inputIndex={m.detailAttemptView.caseIndex}
              attempts={m.detailAttemptView.attempts}
              initialAttemptIndex={m.detailAttemptView.initialAttemptIndex}
              baselineSnapshot={m.detailAttemptView.baselineSnapshot}
              replayRequestMeta={m.detailAttemptView.replayRequestMeta ?? null}
              toolContext={m.detailAttemptView.toolContext ?? null}
            />
          </ClientPortal>
        )}

        <ReleaseGateConfigPanel
          isOpen={m.settingsPanelOpen && !!m.agentId}
          onClose={() => m.setSettingsPanelOpen(false)}
        />

        {m.tab === "history" && (
          <ReleaseGateHistoryExplorer
            historyStatus={m.historyStatus}
            setHistoryStatus={m.setHistoryStatus}
            historyDatePreset={m.historyDatePreset}
            setHistoryDatePreset={m.setHistoryDatePreset}
            historyTraceId={m.historyTraceId}
            setHistoryTraceId={m.setHistoryTraceId}
            historyRefreshing={m.historyRefreshing}
            mutateHistory={m.mutateHistory}
            historyDateSummary={m.historyDateSummary}
            historyLoading={m.historyLoading}
            historyItems={m.historyItems}
            historyTotal={m.historyTotal}
            selectedRunId={m.selectedRunId}
            selectedRunReportLoading={m.selectedRunReportLoading}
            selectHistoryRun={m.selectHistoryRun}
            historyOffset={m.historyOffset}
            historyLimit={m.historyLimit}
            setHistoryOffset={m.setHistoryOffset}
          />
        )}

        <ReleaseGateExpandedBaselineDetailPortal
          baselineDetailSnapshot={m.baselineDetailSnapshot}
          onClose={() => m.setBaselineDetailSnapshot(null)}
          evalRows={m.baselineEvalRows}
          evalContextLabel={m.baselineEvalContextLabel}
        />
      </div>
    </div>
  );
}
