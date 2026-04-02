"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";

import type { GateTab } from "./releaseGateExpandedHelpers";
import { getCasesFromReport } from "./releaseGateExpandedHelpers";
import type { ReleaseGateHistoryItem } from "@/lib/api/types";

export type ExpandedDetailAttemptView = {
  attempts: any[];
  caseIndex: number;
  initialAttemptIndex: number;
  baselineSnapshot: Record<string, unknown> | null;
  replayRequestMeta?: Record<string, unknown> | null;
  toolContext?: Record<string, unknown> | null;
} | null;

export type UseReleaseGateExpandedHistoryOverlayParams = {
  rightPanelTab: "results" | "history";
  tab: GateTab;
  selectedRunId: string | null;
  setSelectedRunId: (id: string | null) => void;
  selectedRunCaseIndex: number | null;
  setSelectedRunCaseIndex: (n: number | null) => void;
  selectedRunReport: unknown;
  selectedRunReportLoading: boolean;
  selectedRunReportError: unknown;
  baselineSnapshotsById: Map<string, Record<string, unknown>>;
  recentSnapshots: unknown[];
  setExpandedHistoryId: Dispatch<SetStateAction<string | null>>;
  setDetailAttemptView: Dispatch<SetStateAction<ExpandedDetailAttemptView>>;
};

export function useReleaseGateExpandedHistoryOverlay(p: UseReleaseGateExpandedHistoryOverlayParams) {
  const {
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
  } = p;
  const pendingSelectionRef = useRef<{
    rowId: string;
    reportId: string;
    caseIndex: number;
  } | null>(null);

  const clearHistoryOverlayPending = useCallback(() => {
    pendingSelectionRef.current = null;
  }, []);

  const selectHistoryRun = useCallback(
    (item: ReleaseGateHistoryItem) => {
      pendingSelectionRef.current = {
        rowId: item.id,
        reportId: item.report_id,
        caseIndex: Number(item.case_index ?? 0),
      };
      setSelectedRunId(item.report_id);
      setSelectedRunCaseIndex(Number(item.case_index ?? 0));
      setExpandedHistoryId(item.id);
    },
    [setSelectedRunId, setSelectedRunCaseIndex, setExpandedHistoryId]
  );

  useEffect(() => {
    if (rightPanelTab !== "history" && tab !== "history") {
      pendingSelectionRef.current = null;
    }
  }, [rightPanelTab, tab]);

  useEffect(() => {
    if (!pendingSelectionRef.current || selectedRunReportLoading) return;
    if (selectedRunReportError) {
      pendingSelectionRef.current = null;
      setSelectedRunId(null);
      setSelectedRunCaseIndex(null);
    }
  }, [selectedRunReportLoading, selectedRunReportError, setSelectedRunId, setSelectedRunCaseIndex]);

  useEffect(() => {
    const pending = pendingSelectionRef.current;
    if (!pending || String(pending.reportId) !== String(selectedRunId ?? "")) return;
    if (selectedRunReportLoading || !selectedRunReport) return;
    const reportObj = selectedRunReport as Record<string, unknown>;
    if (String(reportObj.id) !== String(selectedRunId)) return;
    const historyUiActive = rightPanelTab === "history" || tab === "history";
    if (!historyUiActive) return;

    const cases = getCasesFromReport(selectedRunReport);
    const caseIndex = Number.isInteger(selectedRunCaseIndex) ? Number(selectedRunCaseIndex) : pending.caseIndex;
    const run = caseIndex >= 0 ? cases[caseIndex] : null;
    pendingSelectionRef.current = null;

    if (!run || !Array.isArray(run?.attempts) || run.attempts.length === 0) {
      setSelectedRunId(null);
      setSelectedRunCaseIndex(null);
      return;
    }

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
      replayRequestMeta:
        reportObj.replay_request_meta &&
        typeof reportObj.replay_request_meta === "object" &&
        !Array.isArray(reportObj.replay_request_meta)
          ? (reportObj.replay_request_meta as Record<string, unknown>)
          : null,
      toolContext:
        reportObj.experiment &&
        typeof reportObj.experiment === "object" &&
        !Array.isArray(reportObj.experiment) &&
        (reportObj.experiment as Record<string, unknown>).tool_context &&
        typeof (reportObj.experiment as Record<string, unknown>).tool_context === "object" &&
        !Array.isArray((reportObj.experiment as Record<string, unknown>).tool_context)
          ? ((reportObj.experiment as Record<string, unknown>).tool_context as Record<string, unknown>)
          : null,
    });
    setSelectedRunId(null);
    setSelectedRunCaseIndex(null);
  }, [
    selectedRunReport,
    selectedRunId,
    selectedRunCaseIndex,
    selectedRunReportLoading,
    rightPanelTab,
    tab,
    baselineSnapshotsById,
    recentSnapshots,
    setSelectedRunId,
    setSelectedRunCaseIndex,
    setDetailAttemptView,
  ]);

  return { clearHistoryOverlayPending, selectHistoryRun };
}
