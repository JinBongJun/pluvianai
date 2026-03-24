"use client";

import { useMemo } from "react";
import useSWR from "swr";

import type { ReleaseGateConfigPanelContextSlice } from "./releaseGateConfigPanelContextPick";
import { liveViewAPI, type LiveViewToolTimelineRow } from "@/lib/api/live-view";

/** Baseline snapshot tool timeline for parity UI and left-column summary (SWR while config panel is open). */
export function useReleaseGateConfigPanelBaselineToolTimeline(
  isOpen: boolean,
  c: ReleaseGateConfigPanelContextSlice
) {
  const { projectId, baselineSeedSnapshot, runSnapshotIds } = c;

  const snapshotIdForBaselineTimeline = useMemo(() => {
    const seedId = baselineSeedSnapshot?.id;
    if (typeof seedId === "number" && Number.isFinite(seedId)) return seedId;
    if (runSnapshotIds.length > 0) {
      const n = Number(runSnapshotIds[0]);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }, [baselineSeedSnapshot, runSnapshotIds]);

  const { data: baselineSnapshotDetail, isLoading: baselineTimelineLoading } = useSWR(
    isOpen && projectId > 0 && snapshotIdForBaselineTimeline != null
      ? ["release-gate-config-baseline-timeline", projectId, snapshotIdForBaselineTimeline]
      : null,
    () => liveViewAPI.getSnapshot(projectId, snapshotIdForBaselineTimeline!)
  );

  const baselineToolTimelineRows: LiveViewToolTimelineRow[] = useMemo(() => {
    const raw = baselineSnapshotDetail as Record<string, unknown> | undefined;
    const tl = raw?.tool_timeline;
    return Array.isArray(tl) ? (tl as LiveViewToolTimelineRow[]) : [];
  }, [baselineSnapshotDetail]);

  return {
    snapshotIdForBaselineTimeline,
    baselineTimelineLoading,
    baselineToolTimelineRows,
  };
}
