"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { releaseGateAPI, type ReleaseGateHistoryResponse, type ReleaseGateHistoryItem } from "@/lib/api";
import {
  EMPTY_SWF_ITEMS,
  getPresetHistoryDateRange,
  type HistoryDatePreset,
} from "./releaseGatePageContent.lib";

const HISTORY_LIMIT = 20;

export type ReleaseGateHistoryStatusFilter = "all" | "pass" | "fail";

function removeHistoryReport(
  data: ReleaseGateHistoryResponse | undefined,
  reportId: string
): ReleaseGateHistoryResponse | undefined {
  if (!data) return data;
  const filteredItems = (data.items ?? []).filter(item => String(item.report_id) !== reportId);
  const removedCount = Math.max(0, (data.items ?? []).length - filteredItems.length);
  return {
    ...data,
    items: filteredItems,
    total: Math.max(0, Number(data.total ?? 0) - removedCount),
  };
}

export function useReleaseGateHistory(options: {
  projectId: number;
  runLocked: boolean;
  agentId: string;
  enabled?: boolean;
  onDeleteSession?: (reportId: string) => void;
}) {
  const { projectId, runLocked, agentId, enabled = true, onDeleteSession } = options;

  const [historyStatus, setHistoryStatus] = useState<ReleaseGateHistoryStatusFilter>("all");
  const [historyTraceId, setHistoryTraceId] = useState("");
  const [historyDatePreset, setHistoryDatePreset] = useState<HistoryDatePreset>("all");
  const [historyOffset, setHistoryOffset] = useState(0);
  const [deletingReportIds, setDeletingReportIds] = useState<string[]>([]);
  const normalizedAgentId = agentId.trim();

  useEffect(() => {
    setHistoryOffset(0);
  }, [normalizedAgentId]);

  const historyKey = useMemo(
    () =>
      enabled && normalizedAgentId && projectId && !isNaN(projectId)
        ? [
            "release-gate-history",
            projectId,
            normalizedAgentId,
            historyStatus,
            historyTraceId,
            historyDatePreset,
            historyOffset,
          ]
        : null,
    [enabled, normalizedAgentId, projectId, historyStatus, historyTraceId, historyDatePreset, historyOffset]
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
        agent_id: normalizedAgentId,
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

  useEffect(() => {
    if (historyLoading) return;
    if (historyOffset <= 0) return;
    if (historyItems.length > 0) return;
    if (historyTotal <= 0) return;
    setHistoryOffset(prev => Math.max(0, prev - HISTORY_LIMIT));
  }, [historyItems.length, historyLoading, historyOffset, historyTotal]);

  const deleteHistorySession = useCallback(
    async (reportId: string) => {
      const normalizedReportId = String(reportId || "").trim();
      if (!normalizedReportId || runLocked || deletingReportIds.includes(normalizedReportId)) {
        return {
          ok: true as const,
          report_id: normalizedReportId,
          deleted: false,
          deleted_inputs: 0,
        };
      }
      onDeleteSession?.(normalizedReportId);
      setDeletingReportIds(prev => [...prev, normalizedReportId]);
      const rollbackData = historyData;
      const optimisticData = removeHistoryReport(historyData, normalizedReportId);
      if (optimisticData) {
        await mutateHistory(optimisticData, { revalidate: false });
      }
      try {
        const response = await releaseGateAPI.deleteHistorySession(projectId, normalizedReportId);
        await mutateHistory();
        return response;
      } catch (error) {
        if (rollbackData) {
          await mutateHistory(rollbackData, { revalidate: false });
        } else {
          await mutateHistory();
        }
        throw error;
      } finally {
        setDeletingReportIds(prev => prev.filter(id => id !== normalizedReportId));
      }
    },
    [deletingReportIds, historyData, mutateHistory, onDeleteSession, projectId, runLocked]
  );

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
    deletingReportIds,
    deleteHistorySession,
    mutateHistory,
  };
}
