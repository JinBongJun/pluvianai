"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

export type UseReleaseGateSelectedSnapshotsSideEffectsParams = {
  selectedSnapshotIdsForRun: string[];
  agentId: string;
  representativeBaselineUserSnapshotId: string | null;
  setRepresentativeBaselineUserSnapshotId: Dispatch<SetStateAction<string | null>>;
  setToolContextBySnapshotId: Dispatch<SetStateAction<Record<string, string>>>;
  setRequestBodyOverridesBySnapshotId: Dispatch<
    SetStateAction<Record<string, Record<string, unknown>>>
  >;
  setBodyOverridesSnapshotDraftRaw: Dispatch<SetStateAction<Record<string, string>>>;
  setBodyOverridesSnapshotJsonError: Dispatch<SetStateAction<Record<string, string>>>;
  setRequestBodyOverrides: Dispatch<SetStateAction<Record<string, unknown>>>;
  setBodyOverridesJsonDraft: Dispatch<SetStateAction<string | null>>;
  setBodyOverridesJsonError: Dispatch<SetStateAction<string>>;
};

export function useReleaseGateSelectedSnapshotsSideEffects(
  p: UseReleaseGateSelectedSnapshotsSideEffectsParams
) {
  const {
    selectedSnapshotIdsForRun,
    agentId,
    representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId,
    setToolContextBySnapshotId,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
  } = p;

  const prevAgentIdForBodyOverridesRef = useRef<string | null>(null);

  useEffect(() => {
    setToolContextBySnapshotId(prev => {
      const next = { ...prev };
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      for (const id of selectedSnapshotIdsForRun) {
        const sid = String(id);
        if (!(sid in next)) next[sid] = "";
      }
      return next;
    });
  }, [selectedSnapshotIdsForRun, setToolContextBySnapshotId]);

  useEffect(() => {
    setRequestBodyOverridesBySnapshotId(prev => {
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
    setBodyOverridesSnapshotDraftRaw(prev => {
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
    setBodyOverridesSnapshotJsonError(prev => {
      const ids = new Set(selectedSnapshotIdsForRun.map(String));
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (!ids.has(k)) delete next[k];
      }
      return next;
    });
  }, [
    selectedSnapshotIdsForRun,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
  ]);

  useEffect(() => {
    const cur = agentId.trim();
    if (
      prevAgentIdForBodyOverridesRef.current !== null &&
      prevAgentIdForBodyOverridesRef.current !== cur
    ) {
      setRequestBodyOverrides({});
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
      setRequestBodyOverridesBySnapshotId({});
      setBodyOverridesSnapshotDraftRaw({});
      setBodyOverridesSnapshotJsonError({});
    }
    prevAgentIdForBodyOverridesRef.current = cur;
  }, [
    agentId,
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
  ]);

  useEffect(() => {
    const allowed = new Set(selectedSnapshotIdsForRun.map(String));
    if (
      representativeBaselineUserSnapshotId &&
      !allowed.has(representativeBaselineUserSnapshotId)
    ) {
      setRepresentativeBaselineUserSnapshotId(null);
    }
  }, [
    selectedSnapshotIdsForRun,
    representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId,
  ]);
}
