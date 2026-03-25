"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { liveViewAPI } from "@/lib/api";
import { extractToolResultTextFromSnapshotRecord } from "./releaseGatePageContent.lib";

export type UseReleaseGateToolContextLoaderParams = {
  projectId: number;
  selectedSnapshotIdsForRun: string[];
  toolContextScope: "global" | "per_snapshot";
  effectiveRepresentativeBaselineSnapshotId: string | null;
  setToolContextGlobalText: Dispatch<SetStateAction<string>>;
  setToolContextBySnapshotId: Dispatch<SetStateAction<Record<string, string>>>;
  setToolContextLoadBusy: Dispatch<SetStateAction<boolean>>;
};

export function useReleaseGateToolContextLoader(p: UseReleaseGateToolContextLoaderParams) {
  const {
    projectId,
    selectedSnapshotIdsForRun,
    toolContextScope,
    effectiveRepresentativeBaselineSnapshotId,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    setToolContextLoadBusy,
  } = p;

  const handleLoadToolContextFromSnapshots = useCallback(async () => {
    if (!projectId || Number.isNaN(projectId)) return;
    const ids = selectedSnapshotIdsForRun.map(String).filter(Boolean);
    if (ids.length === 0) return;
    setToolContextLoadBusy(true);
    try {
      if (toolContextScope === "global") {
        const preferred =
          effectiveRepresentativeBaselineSnapshotId &&
          ids.includes(effectiveRepresentativeBaselineSnapshotId)
            ? effectiveRepresentativeBaselineSnapshotId
            : ids[0];
        const snap = await liveViewAPI.getSnapshot(projectId, preferred);
        setToolContextGlobalText(
          extractToolResultTextFromSnapshotRecord(snap as Record<string, unknown>)
        );
      } else {
        const merged: Record<string, string> = {};
        for (const id of ids) {
          const snap = await liveViewAPI.getSnapshot(projectId, id);
          merged[id] = extractToolResultTextFromSnapshotRecord(snap as Record<string, unknown>);
        }
        setToolContextBySnapshotId(prev => ({ ...prev, ...merged }));
      }
    } catch {
      // ignore
    } finally {
      setToolContextLoadBusy(false);
    }
  }, [
    projectId,
    selectedSnapshotIdsForRun,
    toolContextScope,
    effectiveRepresentativeBaselineSnapshotId,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    setToolContextLoadBusy,
  ]);

  return { handleLoadToolContextFromSnapshots };
}
