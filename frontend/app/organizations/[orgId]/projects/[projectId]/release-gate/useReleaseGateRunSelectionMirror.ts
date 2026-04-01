"use client";

import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

export type UseReleaseGateRunSelectionMirrorParams = {
  datasetIds: string[];
  snapshotIds: string[];
  setRunDatasetIds: Dispatch<SetStateAction<string[]>>;
  setRunSnapshotIds: Dispatch<SetStateAction<string[]>>;
};

/** Mirrors picker `datasetIds` / `snapshotIds` into frozen run lists used by baseline + validate. */
export function useReleaseGateRunSelectionMirror(p: UseReleaseGateRunSelectionMirrorParams) {
  const { datasetIds, snapshotIds, setRunDatasetIds, setRunSnapshotIds } = p;
  const datasetIdsKey = useMemo(() => datasetIds.join(","), [datasetIds]);
  const snapshotIdsKey = useMemo(() => snapshotIds.join(","), [snapshotIds]);
  const mirroredDatasetIds = useMemo(
    () => (datasetIdsKey ? datasetIdsKey.split(",") : []),
    [datasetIdsKey]
  );
  const mirroredSnapshotIds = useMemo(
    () => (snapshotIdsKey ? snapshotIdsKey.split(",") : []),
    [snapshotIdsKey]
  );

  useEffect(() => {
    setRunDatasetIds(mirroredDatasetIds);
  }, [mirroredDatasetIds, setRunDatasetIds]);

  useEffect(() => {
    setRunSnapshotIds(mirroredSnapshotIds);
  }, [mirroredSnapshotIds, setRunSnapshotIds]);
}
