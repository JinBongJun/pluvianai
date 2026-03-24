"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    setRunDatasetIds(datasetIds.length ? [...datasetIds] : []);
  }, [datasetIds.join(","), setRunDatasetIds]);

  useEffect(() => {
    setRunSnapshotIds(snapshotIds.length ? [...snapshotIds] : []);
  }, [snapshotIds.join(","), setRunSnapshotIds]);
}
