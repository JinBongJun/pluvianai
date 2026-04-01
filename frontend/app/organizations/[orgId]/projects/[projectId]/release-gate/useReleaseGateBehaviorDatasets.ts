"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { behaviorAPI } from "@/lib/api";
import { EMPTY_SWF_ITEMS } from "./releaseGatePageContent.lib";
import type { ReleaseGateDatasetSummary } from "./releaseGatePageContext.types";

export type ReleaseGateDatasetSnapshotsAggregate = {
  items: any[];
  total: number;
  missingDatasetIds?: string[];
  failedDatasetIds?: string[];
};

export function useReleaseGateBehaviorDatasets(options: {
  projectId: number;
  agentId: string;
  runLocked: boolean;
  expandedDatasetId: string | null;
  runDatasetIds: string[];
}) {
  const { projectId, agentId, runLocked, expandedDatasetId, runDatasetIds } = options;

  const datasetsKey = useMemo(
    () =>
      projectId && !isNaN(projectId) && agentId?.trim()
        ? ["behavior-datasets", projectId, agentId.trim()]
        : null,
    [projectId, agentId]
  );
  const {
    data: datasetsData,
    isLoading: datasetsLoading,
    error: datasetsError,
    mutate: mutateDatasets,
  } = useSWR(
    datasetsKey,
    () => behaviorAPI.listDatasets(projectId, { agent_id: agentId.trim(), limit: 50 }),
    { isPaused: () => runLocked }
  );
  const datasets = datasetsData?.items ?? EMPTY_SWF_ITEMS;

  const normalizedRunDatasetIds = useMemo(
    () => Array.from(new Set(runDatasetIds.map(id => String(id).trim()).filter(Boolean))),
    [runDatasetIds]
  );

  const datasetSnapshotsKey = useMemo(
    () =>
      projectId && !isNaN(projectId) && normalizedRunDatasetIds.length > 0
        ? ["behavior-dataset-snapshots", projectId, normalizedRunDatasetIds.join(",")]
        : null,
    [projectId, normalizedRunDatasetIds]
  );
  const {
    data: datasetSnapshotsData,
    isLoading: datasetSnapshotsLoading,
    error: datasetSnapshotsError,
    mutate: mutateDatasetSnapshots,
  } = useSWR(
    datasetSnapshotsKey,
    async () => {
      const responses = await Promise.allSettled(
        normalizedRunDatasetIds.map(async datasetId => {
          try {
            return {
              datasetId,
              response: await behaviorAPI.getDatasetSnapshots(projectId, datasetId),
            };
          } catch (error) {
            throw { datasetId, error };
          }
        })
      );
      const mergedItems: any[] = [];
      const seenSnapshotIds = new Set<string>();
      const missingDatasetIds: string[] = [];
      const failedDatasetIds: string[] = [];
      for (const result of responses) {
        if (result.status === "fulfilled") {
          const items = Array.isArray(result.value.response?.items) ? result.value.response.items : [];
          for (const item of items) {
            const snapshotId = item && typeof item === "object" ? String((item as any).id ?? "") : "";
            if (!snapshotId || seenSnapshotIds.has(snapshotId)) continue;
            seenSnapshotIds.add(snapshotId);
            mergedItems.push(item);
          }
          continue;
        }
        const rejected = result.reason as {
          datasetId?: string;
          error?: { response?: { status?: number } };
        };
        const matchedDatasetId = rejected?.datasetId ?? null;
        const status = rejected?.error?.response?.status;
        if (status === 404) {
          if (matchedDatasetId) missingDatasetIds.push(matchedDatasetId);
          continue;
        }
        if (matchedDatasetId) failedDatasetIds.push(matchedDatasetId);
        throw rejected?.error ?? result.reason;
      }
      return {
        items: mergedItems,
        total: mergedItems.length,
        missingDatasetIds,
        failedDatasetIds,
      } satisfies ReleaseGateDatasetSnapshotsAggregate;
    },
    { isPaused: () => runLocked }
  );

  const datasetSnapshots =
    (datasetSnapshotsData as ReleaseGateDatasetSnapshotsAggregate | undefined)?.items ?? EMPTY_SWF_ITEMS;
  const datasetSnapshots404 = (() => {
    const data = datasetSnapshotsData as ReleaseGateDatasetSnapshotsAggregate | undefined;
    const missingCount = data?.missingDatasetIds?.length ?? 0;
    return normalizedRunDatasetIds.length > 0 && missingCount === normalizedRunDatasetIds.length;
  })();

  const expandedDatasetSnapshotsKey = useMemo(
    () =>
      projectId && !isNaN(projectId) && expandedDatasetId
        ? ["dataset-snapshots-expanded", projectId, expandedDatasetId]
        : null,
    [projectId, expandedDatasetId]
  );
  const {
    data: expandedDatasetSnapshotsData,
    isLoading: expandedDatasetSnapshotsLoading,
    error: expandedDatasetSnapshotsError,
    mutate: mutateExpandedDatasetSnapshots,
  } = useSWR(
    expandedDatasetSnapshotsKey,
    async () => {
      try {
        return await behaviorAPI.getDatasetSnapshots(projectId!, expandedDatasetId!);
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          return { items: [], total: 0, _404: true };
        }
        throw e;
      }
    },
    { isPaused: () => runLocked }
  );
  const expandedDatasetSnapshots = expandedDatasetSnapshotsData?.items ?? EMPTY_SWF_ITEMS;
  const expandedDatasetSnapshots404 = !!(
    expandedDatasetSnapshotsData as { _404?: boolean } | undefined
  )?._404;

  const selectedDatasetSnapshotCount = useMemo(() => {
    if (normalizedRunDatasetIds.length === 0) return 0;
    if (datasetSnapshotsKey && datasetSnapshotsData) return datasetSnapshots.length;
    return normalizedRunDatasetIds.reduce((total, datasetId) => {
      const dataset = datasets.find((item: ReleaseGateDatasetSummary) => item.id === datasetId);
      if (!dataset) return total;
      if (typeof dataset.snapshot_count === "number") return total + dataset.snapshot_count;
      if (Array.isArray(dataset.snapshot_ids)) return total + dataset.snapshot_ids.length;
      return total;
    }, 0);
  }, [datasets, normalizedRunDatasetIds, datasetSnapshotsKey, datasetSnapshotsData, datasetSnapshots.length]);

  return {
    datasets,
    datasetsLoading,
    datasetsError,
    mutateDatasets,
    normalizedRunDatasetIds,
    datasetSnapshots,
    datasetSnapshotsLoading,
    datasetSnapshotsError,
    datasetSnapshots404,
    mutateDatasetSnapshots,
    expandedDatasetSnapshots,
    expandedDatasetSnapshotsLoading,
    expandedDatasetSnapshotsError,
    expandedDatasetSnapshots404,
    mutateExpandedDatasetSnapshots,
    selectedDatasetSnapshotCount,
  };
}
