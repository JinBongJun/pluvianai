"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";

import type { GateTab } from "./releaseGateExpandedHelpers";
import { findFirstCaseWithAttempts, getCasesFromReport } from "./releaseGateExpandedHelpers";

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
    selectedRunReport,
    selectedRunReportLoading,
    selectedRunReportError,
    baselineSnapshotsById,
    recentSnapshots,
    setExpandedHistoryId,
    setDetailAttemptView,
  } = p;
  const pendingRunIdRef = useRef<string | null>(null);

  const clearHistoryOverlayPending = useCallback(() => {
    pendingRunIdRef.current = null;
  }, []);

  const selectHistoryRun = useCallback(
    (id: string) => {
      pendingRunIdRef.current = id;
      setSelectedRunId(id);
      setExpandedHistoryId(id);
    },
    [setSelectedRunId, setExpandedHistoryId]
  );

  useEffect(() => {
    if (rightPanelTab !== "history" && tab !== "history") {
      pendingRunIdRef.current = null;
    }
  }, [rightPanelTab, tab]);

  useEffect(() => {
    if (!pendingRunIdRef.current || selectedRunReportLoading) return;
    if (selectedRunReportError) {
      pendingRunIdRef.current = null;
      setSelectedRunId(null);
    }
  }, [selectedRunReportLoading, selectedRunReportError, setSelectedRunId]);

  useEffect(() => {
    const pending = pendingRunIdRef.current;
    if (!pending || String(pending) !== String(selectedRunId ?? "")) return;
    if (selectedRunReportLoading || !selectedRunReport) return;
    const reportObj = selectedRunReport as Record<string, unknown>;
    if (String(reportObj.id) !== String(selectedRunId)) return;
    const historyUiActive = rightPanelTab === "history" || tab === "history";
    if (!historyUiActive) return;

    const cases = getCasesFromReport(selectedRunReport);
    const picked = findFirstCaseWithAttempts(cases);
    pendingRunIdRef.current = null;

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
  }, [
    selectedRunReport,
    selectedRunId,
    selectedRunReportLoading,
    rightPanelTab,
    tab,
    baselineSnapshotsById,
    recentSnapshots,
    setSelectedRunId,
    setDetailAttemptView,
  ]);

  return { clearHistoryOverlayPending, selectHistoryRun };
}
