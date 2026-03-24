"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { releaseGateAPI, type ReleaseGateHistoryResponse } from "@/lib/api";
import {
  EMPTY_SWF_ITEMS,
  getPresetHistoryDateRange,
  type HistoryDatePreset,
} from "./releaseGatePageContent.lib";

const HISTORY_LIMIT = 20;

export type ReleaseGateHistoryStatusFilter = "all" | "pass" | "fail";

export function useReleaseGateHistory(options: { projectId: number; runLocked: boolean }) {
  const { projectId, runLocked } = options;

  const [historyStatus, setHistoryStatus] = useState<ReleaseGateHistoryStatusFilter>("all");
  const [historyTraceId, setHistoryTraceId] = useState("");
  const [historyDatePreset, setHistoryDatePreset] = useState<HistoryDatePreset>("all");
  const [historyOffset, setHistoryOffset] = useState(0);

  const historyKey = useMemo(
    () =>
      projectId && !isNaN(projectId)
        ? [
            "release-gate-history",
            projectId,
            historyStatus,
            historyTraceId,
            historyDatePreset,
            historyOffset,
          ]
        : null,
    [projectId, historyStatus, historyTraceId, historyDatePreset, historyOffset]
  );

  const historyDateParams = useMemo(
    () => getPresetHistoryDateRange(historyDatePreset),
    [historyDatePreset]
  );

  const {
    data: historyData,
    mutate: mutateHistory,
    isLoading: historyLoading,
    isValidating: historyRefreshing,
  } = useSWR<ReleaseGateHistoryResponse>(
    historyKey,
    () =>
      releaseGateAPI.listHistory(projectId, {
        status: historyStatus === "all" ? undefined : historyStatus,
        trace_id: historyTraceId.trim() || undefined,
        created_from: historyDateParams.createdFrom,
        created_to: historyDateParams.createdTo,
        limit: HISTORY_LIMIT,
        offset: historyOffset,
      }),
    { keepPreviousData: true, isPaused: () => runLocked }
  );

  const historyItems = historyData?.items ?? EMPTY_SWF_ITEMS;
  const historyTotal = historyData?.total || 0;

  return {
    historyStatus,
    setHistoryStatus,
    historyTraceId,
    setHistoryTraceId,
    historyDatePreset,
    setHistoryDatePreset,
    historyOffset,
    setHistoryOffset,
    historyLimit: HISTORY_LIMIT,
    historyLoading,
    historyRefreshing,
    historyItems,
    historyTotal,
    mutateHistory,
  };
}
