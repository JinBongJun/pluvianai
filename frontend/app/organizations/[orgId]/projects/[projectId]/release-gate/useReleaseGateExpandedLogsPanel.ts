"use client";

import { useMemo, useState } from "react";

import type { LogsStatusFilter } from "./releaseGateExpandedHelpers";
import { extractErrorMessage } from "./releaseGateViewUtils";

export type UseReleaseGateExpandedLogsPanelParams = {
  recentSnapshots: unknown[];
  baselineSnapshotsById: Map<string, Record<string, unknown>>;
  snapshotEvalFailed: (snap: Record<string, unknown> | null) => boolean;
  recentSnapshotsError: unknown;
  datasetsError: unknown;
  expandedDatasetSnapshots404: boolean;
  datasetSnapshots404: boolean;
  expandedDatasetSnapshotsError: unknown;
  datasetSnapshotsError: unknown;
};

export function useReleaseGateExpandedLogsPanel(p: UseReleaseGateExpandedLogsPanelParams) {
  const [logsStatusFilter, setLogsStatusFilter] = useState<LogsStatusFilter>("all");
  const [logsSortMode, setLogsSortMode] = useState<"newest" | "oldest">("newest");
  const [logsShowLimit, setLogsShowLimit] = useState<10 | 20 | 30 | 50 | 100 | 200>(30);

  const recentSnapshotsErrorMessage = useMemo(
    () =>
      p.recentSnapshotsError
        ? extractErrorMessage(
            p.recentSnapshotsError,
            "Unable to load recent snapshots right now. Retry in a few seconds."
          )
        : "",
    [p.recentSnapshotsError]
  );

  const datasetsErrorMessage = useMemo(
    () =>
      p.datasetsError
        ? extractErrorMessage(p.datasetsError, "Unable to load saved datasets right now. Please retry.")
        : "",
    [p.datasetsError]
  );

  const expandedDatasetErrorMessage = useMemo(() => {
    if (p.expandedDatasetSnapshots404 || p.datasetSnapshots404) {
      return "This dataset is no longer available (it may have been deleted).";
    }
    if (p.expandedDatasetSnapshotsError) {
      return extractErrorMessage(
        p.expandedDatasetSnapshotsError,
        "Unable to load snapshots in this dataset right now. Please retry."
      );
    }
    if (p.datasetSnapshotsError) {
      return extractErrorMessage(
        p.datasetSnapshotsError,
        "Unable to resolve dataset snapshots for this run. Please retry."
      );
    }
    return "";
  }, [
    p.expandedDatasetSnapshots404,
    p.datasetSnapshots404,
    p.expandedDatasetSnapshotsError,
    p.datasetSnapshotsError,
  ]);

  const logsFilteredSorted = useMemo((): Record<string, unknown>[] => {
    const items: Record<string, unknown>[] = Array.isArray(p.recentSnapshots)
      ? (p.recentSnapshots as Record<string, unknown>[])
      : [];
    const filtered = items.filter(item => {
      const rowId = String(item.id ?? "");
      const full =
        (rowId ? p.baselineSnapshotsById.get(rowId) : undefined) ??
        item;
      if (logsStatusFilter === "all") return true;
      const failed = p.snapshotEvalFailed(full);
      if (logsStatusFilter === "failed") return failed;
      return !failed;
    });
    filtered.sort((a, b) => {
      const aTime = a.created_at ? new Date(String(a.created_at)).getTime() : 0;
      const bTime = b.created_at ? new Date(String(b.created_at)).getTime() : 0;
      return logsSortMode === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return filtered;
  }, [
    p.baselineSnapshotsById,
    p.recentSnapshots,
    p.snapshotEvalFailed,
    logsSortMode,
    logsStatusFilter,
  ]);

  const logsMatchCount = logsFilteredSorted.length;

  const filteredRecentSnapshots = useMemo(
    () => logsFilteredSorted.slice(0, logsShowLimit),
    [logsFilteredSorted, logsShowLimit]
  );

  return {
    logsStatusFilter,
    setLogsStatusFilter,
    logsSortMode,
    setLogsSortMode,
    logsShowLimit,
    setLogsShowLimit,
    recentSnapshotsErrorMessage,
    datasetsErrorMessage,
    expandedDatasetErrorMessage,
    logsMatchCount,
    filteredRecentSnapshots,
  };
}
