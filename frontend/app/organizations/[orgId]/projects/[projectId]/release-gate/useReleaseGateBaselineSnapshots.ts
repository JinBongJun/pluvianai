"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { liveViewAPI, releaseGateAPI } from "@/lib/api";
import {
  BASELINE_SNAPSHOT_LIMIT,
  compareSnapshotsNewestFirst,
  EMPTY_SWF_ITEMS,
  pickNewestSnapshot,
  RECENT_SNAPSHOT_LIMIT,
} from "./releaseGatePageContent.lib";

export function useReleaseGateBaselineSnapshots(options: {
  projectId: number;
  agentId: string;
  runLocked: boolean;
  dataSource: "recent" | "datasets";
  runSnapshotIds: string[];
  datasetSnapshots: unknown[];
  representativeBaselineUserSnapshotId: string | null;
}) {
  const {
    projectId,
    agentId,
    runLocked,
    dataSource,
    runSnapshotIds,
    datasetSnapshots,
    representativeBaselineUserSnapshotId,
  } = options;

  const recentSnapshotsKey =
    projectId && !isNaN(projectId) && agentId?.trim()
      ? ["release-gate-recent-snapshots", projectId, agentId.trim(), RECENT_SNAPSHOT_LIMIT]
      : null;
  const {
    data: recentSnapshotsData,
    isLoading: recentSnapshotsLoading,
    error: recentSnapshotsError,
    mutate: mutateRecentSnapshots,
  } = useSWR(
    recentSnapshotsKey,
    () => releaseGateAPI.getRecentSnapshots(projectId, agentId!.trim(), RECENT_SNAPSHOT_LIMIT),
    { isPaused: () => runLocked }
  );
  const recentSnapshotsAll = recentSnapshotsData?.items ?? EMPTY_SWF_ITEMS;
  const recentSnapshots = recentSnapshotsAll;
  const recentSnapshotsTotalAvailable =
    typeof (recentSnapshotsData as { total_available?: number } | undefined)?.total_available ===
    "number"
      ? (recentSnapshotsData as { total_available: number }).total_available
      : undefined;

  const baselineSnapshotPoolKey =
    projectId && !isNaN(projectId) && agentId?.trim()
      ? ["release-gate-baseline-payloads", projectId, agentId.trim(), BASELINE_SNAPSHOT_LIMIT]
      : null;
  const { data: baselineSnapshotPoolData } = useSWR(
    baselineSnapshotPoolKey,
    () =>
      liveViewAPI.listSnapshots(projectId, {
        agent_id: agentId.trim(),
        limit: BASELINE_SNAPSHOT_LIMIT,
        offset: 0,
      }),
    { isPaused: () => runLocked }
  );
  const baselineSnapshotPool = baselineSnapshotPoolData?.items ?? EMPTY_SWF_ITEMS;

  const selectedSnapshotIdsForRun = useMemo(() => {
    if (dataSource === "recent") return runSnapshotIds.map(x => String(x));
    if (dataSource === "datasets") {
      return datasetSnapshots.map((s: any) => String(s.id));
    }
    return [];
  }, [dataSource, runSnapshotIds, datasetSnapshots]);

  const baselineSnapshotsById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    const isRichSnapshot = (s: Record<string, unknown> | undefined) => {
      if (!s) return false;
      if (typeof s.model === "string" && s.model.trim()) return true;
      if (typeof s.system_prompt === "string" && s.system_prompt.trim()) return true;
      const p = s.payload;
      return Boolean(p && typeof p === "object" && !Array.isArray(p));
    };
    const upsertSnapshot = (s: Record<string, unknown>) => {
      const id = s?.id;
      if (id == null) return;
      const key = String(id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, s);
        return;
      }
      const existingRich = isRichSnapshot(existing);
      const incomingRich = isRichSnapshot(s);
      if (existingRich && !incomingRich) {
        map.set(key, { ...s, ...existing });
        return;
      }
      map.set(key, { ...existing, ...s });
    };

    for (const s of baselineSnapshotPool as Array<Record<string, unknown>>) upsertSnapshot(s);
    for (const s of datasetSnapshots as Array<Record<string, unknown>>) upsertSnapshot(s);
    for (const s of recentSnapshotsAll as Array<Record<string, unknown>>) upsertSnapshot(s);
    return map;
  }, [baselineSnapshotPool, datasetSnapshots, recentSnapshotsAll]);

  const baselineSnapshotsForRun = useMemo(
    () =>
      selectedSnapshotIdsForRun
        .map(id => baselineSnapshotsById.get(id))
        .filter((s): s is Record<string, unknown> => Boolean(s)),
    [selectedSnapshotIdsForRun, baselineSnapshotsById]
  );

  const autoRepresentativeBaselineSnapshot = useMemo(
    () => pickNewestSnapshot(baselineSnapshotsForRun),
    [baselineSnapshotsForRun]
  );
  const autoRepresentativeBaselineSnapshotId = useMemo(
    () =>
      autoRepresentativeBaselineSnapshot?.id != null
        ? String(autoRepresentativeBaselineSnapshot.id)
        : null,
    [autoRepresentativeBaselineSnapshot]
  );

  const effectiveRepresentativeBaselineSnapshotId = useMemo(() => {
    const allowed = new Set(selectedSnapshotIdsForRun.map(String));
    const user = representativeBaselineUserSnapshotId;
    if (user && allowed.has(user) && baselineSnapshotsById.has(user)) return user;
    return autoRepresentativeBaselineSnapshotId;
  }, [
    representativeBaselineUserSnapshotId,
    selectedSnapshotIdsForRun,
    baselineSnapshotsById,
    autoRepresentativeBaselineSnapshotId,
  ]);

  const baselineSeedSnapshot = useMemo(() => {
    if (effectiveRepresentativeBaselineSnapshotId) {
      const fromMap = baselineSnapshotsById.get(effectiveRepresentativeBaselineSnapshotId);
      if (fromMap) return fromMap;
    }
    return (
      autoRepresentativeBaselineSnapshot ??
      baselineSnapshotsForRun[0] ??
      null
    );
  }, [
    effectiveRepresentativeBaselineSnapshotId,
    baselineSnapshotsById,
    autoRepresentativeBaselineSnapshot,
    baselineSnapshotsForRun,
  ]);

  const baselineSeedSnapshotId = useMemo(
    () => (baselineSeedSnapshot?.id != null ? String(baselineSeedSnapshot.id) : null),
    [baselineSeedSnapshot]
  );

  const representativeBaselinePickerOptions = useMemo(() => {
    const rows: Record<string, unknown>[] = [];
    for (const sid of selectedSnapshotIdsForRun) {
      const s = baselineSnapshotsById.get(String(sid));
      if (s) rows.push(s);
    }
    rows.sort(compareSnapshotsNewestFirst);
    return rows.map(s => ({
      id: String(s.id),
      createdAt:
        typeof s.created_at === "string" && s.created_at.trim() ? s.created_at.trim() : "",
    }));
  }, [selectedSnapshotIdsForRun, baselineSnapshotsById]);

  return {
    recentSnapshots,
    recentSnapshotsTotalAvailable,
    recentSnapshotsLoading,
    recentSnapshotsError,
    mutateRecentSnapshots,
    selectedSnapshotIdsForRun,
    baselineSnapshotsById,
    baselineSnapshotsForRun,
    autoRepresentativeBaselineSnapshot,
    autoRepresentativeBaselineSnapshotId,
    effectiveRepresentativeBaselineSnapshotId,
    baselineSeedSnapshot,
    baselineSeedSnapshotId,
    representativeBaselinePickerOptions,
  };
}
