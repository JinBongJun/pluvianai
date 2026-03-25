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
  const pendingRunIdRef = useRef<string | null>(null);

  const clearHistoryOverlayPending = useCallback(() => {
    pendingRunIdRef.current = null;
  }, []);

  const selectHistoryRun = useCallback(
    (id: string) => {
      pendingRunIdRef.current = id;
      p.setSelectedRunId(id);
      p.setExpandedHistoryId(id);
    },
    [p.setSelectedRunId, p.setExpandedHistoryId]
  );

  useEffect(() => {
    if (p.rightPanelTab !== "history" && p.tab !== "history") {
      pendingRunIdRef.current = null;
    }
  }, [p.rightPanelTab, p.tab]);

  useEffect(() => {
    if (!pendingRunIdRef.current || p.selectedRunReportLoading) return;
    if (p.selectedRunReportError) {
      pendingRunIdRef.current = null;
      p.setSelectedRunId(null);
    }
  }, [p.selectedRunReportLoading, p.selectedRunReportError, p.setSelectedRunId]);

  useEffect(() => {
    const pending = pendingRunIdRef.current;
    if (!pending || String(pending) !== String(p.selectedRunId ?? "")) return;
    if (p.selectedRunReportLoading || !p.selectedRunReport) return;
    const reportObj = p.selectedRunReport as Record<string, unknown>;
    if (String(reportObj.id) !== String(p.selectedRunId)) return;
    const historyUiActive = p.rightPanelTab === "history" || p.tab === "history";
    if (!historyUiActive) return;

    const cases = getCasesFromReport(p.selectedRunReport);
    const picked = findFirstCaseWithAttempts(cases);
    pendingRunIdRef.current = null;

    if (!picked || !Array.isArray(picked.run?.attempts) || picked.run.attempts.length === 0) {
      p.setSelectedRunId(null);
      return;
    }

    const { run, caseIndex } = picked;
    const baselineSnapshotForRun =
      (p.baselineSnapshotsById.get(String(run?.snapshot_id ?? "")) as
        | Record<string, unknown>
        | undefined) ??
      (p.recentSnapshots.find(
        s =>
          String((s as Record<string, unknown>)?.id ?? "") === String(run?.snapshot_id ?? "")
      ) as Record<string, unknown> | undefined) ??
      null;

    p.setDetailAttemptView({
      attempts: run.attempts,
      caseIndex,
      initialAttemptIndex: 0,
      baselineSnapshot: baselineSnapshotForRun,
    });
    p.setSelectedRunId(null);
  }, [
    p.selectedRunReport,
    p.selectedRunId,
    p.selectedRunReportLoading,
    p.rightPanelTab,
    p.tab,
    p.baselineSnapshotsById,
    p.recentSnapshots,
    p.setSelectedRunId,
    p.setDetailAttemptView,
  ]);

  return { clearHistoryOverlayPending, selectHistoryRun };
}
