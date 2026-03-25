"use client";

import { useCallback, useState } from "react";

import type { SnapshotForDetail } from "@/components/shared/SnapshotDetailModal";
import { liveViewAPI } from "@/lib/api";

export function useReleaseGateBaselineDetailSnapshot(projectId: number) {
  const [baselineDetailSnapshot, setBaselineDetailSnapshot] =
    useState<SnapshotForDetail | null>(null);

  const openBaselineDetailSnapshot = useCallback(
    (snap: Record<string, unknown>) => {
      const id = snap?.id;
      setBaselineDetailSnapshot({ ...snap } as unknown as SnapshotForDetail);
      if (projectId == null || id == null || Number.isNaN(Number(projectId))) return;
      liveViewAPI
        .getSnapshot(projectId, id as string | number)
        .then((full: Record<string, unknown>) => {
          if (!full || String(full.id) !== String(id)) return;
          setBaselineDetailSnapshot(prev => {
            if (!prev || String(prev.id) !== String(id)) return prev;
            return { ...prev, ...full } as SnapshotForDetail;
          });
        })
        .catch(() => {});
    },
    [projectId]
  );

  return {
    baselineDetailSnapshot,
    setBaselineDetailSnapshot,
    openBaselineDetailSnapshot,
  };
}
