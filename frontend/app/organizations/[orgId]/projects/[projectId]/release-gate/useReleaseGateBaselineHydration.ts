"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { EditableTool, ReplayProvider } from "./releaseGatePageContent.lib";
import {
  asPayloadObject,
  extractOverridesFromPayload,
  extractToolResultTextFromSnapshotRecord,
  getRequestPart,
  inferProviderFromModelId,
  releaseGateCoreRequestBodyFromBaseline,
} from "./releaseGatePageContent.lib";
import {
  sanitizeReplayBodyOverrides,
  stripPerSnapshotOverridesDuplicatingShared,
} from "./releaseGateReplayMerge";

export type ParityHydrationBaseline = {
  selectionKey: string;
  sharedOverrides: Record<string, unknown>;
  perLogOverrides: Record<string, Record<string, unknown>>;
  tools: EditableTool[];
  toolContextBySnapshotId: Record<string, string>;
};

export type UseReleaseGateBaselineHydrationParams = {
  /** When this changes, baseline hydration keys reset (same as clearing node-local seed state). */
  agentId: string;
  selectedSnapshotIdsForRun: string[];
  effectiveRepresentativeBaselineSnapshotId: string | null;
  baselineSeedSnapshot: Record<string, unknown> | null;
  baselinePayload: Record<string, unknown> | null;
  baselineSnapshotsById: Map<string, Record<string, unknown>>;
  baselineTools: EditableTool[];
  runDataModel: string;
  runDataProvider: ReplayProvider | null;
  modelOverrideEnabled: boolean;
  setToolsList: Dispatch<SetStateAction<EditableTool[]>>;
  setRequestBody: Dispatch<SetStateAction<Record<string, unknown>>>;
  setNewModel: Dispatch<SetStateAction<string>>;
  setReplayProvider: Dispatch<SetStateAction<ReplayProvider>>;
  setModelProviderTab: Dispatch<SetStateAction<ReplayProvider>>;
  setRequestJsonError: Dispatch<SetStateAction<string>>;
  setRequestBodyOverrides: Dispatch<SetStateAction<Record<string, unknown>>>;
  setRequestBodyOverridesBySnapshotId: Dispatch<
    SetStateAction<Record<string, Record<string, unknown>>>
  >;
  setBodyOverridesJsonDraft: Dispatch<SetStateAction<string | null>>;
  setBodyOverridesJsonError: Dispatch<SetStateAction<string>>;
  setBodyOverridesSnapshotDraftRaw: Dispatch<SetStateAction<Record<string, string>>>;
  setBodyOverridesSnapshotJsonError: Dispatch<SetStateAction<Record<string, string>>>;
  setToolContextBySnapshotId: Dispatch<SetStateAction<Record<string, string>>>;
};

export function useReleaseGateBaselineHydration(p: UseReleaseGateBaselineHydrationParams) {
  const [toolsHydratedKey, setToolsHydratedKey] = useState("");
  const [overridesHydratedKey, setOverridesHydratedKey] = useState("");
  const parityHydrationBaselineRef = useRef<ParityHydrationBaseline | null>(null);

  const {
    agentId,
    selectedSnapshotIdsForRun,
    effectiveRepresentativeBaselineSnapshotId,
    baselineSeedSnapshot,
    baselinePayload,
    baselineSnapshotsById,
    baselineTools,
    runDataModel,
    runDataProvider,
    modelOverrideEnabled,
    setToolsList,
    setRequestBody,
    setNewModel,
    setReplayProvider,
    setModelProviderTab,
    setRequestJsonError,
    setRequestBodyOverrides,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setToolContextBySnapshotId,
  } = p;

  useEffect(() => {
    setToolsHydratedKey("");
    setOverridesHydratedKey("");
    parityHydrationBaselineRef.current = null;
  }, [agentId]);

  useEffect(() => {
    const selectionKey = `${selectedSnapshotIdsForRun.join(",")}|rep:${effectiveRepresentativeBaselineSnapshotId ?? ""}`;
    if (!selectedSnapshotIdsForRun.length) return;
    if (!baselineSeedSnapshot || !baselinePayload) return;

    if (selectionKey !== toolsHydratedKey) {
      setToolsList(baselineTools);
      setToolsHydratedKey(selectionKey);
    }

    if (selectionKey !== overridesHydratedKey) {
      setRequestBody(releaseGateCoreRequestBodyFromBaseline(baselinePayload));
      if (!modelOverrideEnabled) {
        setNewModel(runDataModel);
        const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
        if (inferredProvider) {
          setReplayProvider(inferredProvider);
          setModelProviderTab(inferredProvider);
        }
      }
      setRequestJsonError("");

      const seedShared = sanitizeReplayBodyOverrides(extractOverridesFromPayload(baselinePayload));
      const seedPer: Record<string, Record<string, unknown>> = {};
      const seedToolCtx: Record<string, string> = {};
      for (const sid of selectedSnapshotIdsForRun) {
        const key = String(sid);
        const snap = baselineSnapshotsById.get(key);
        const raw = snap ? asPayloadObject(snap.payload) : null;
        const req = raw ? getRequestPart(raw) : null;
        const perRaw = sanitizeReplayBodyOverrides(extractOverridesFromPayload(req));
        seedPer[key] = stripPerSnapshotOverridesDuplicatingShared(seedShared, perRaw);
        seedToolCtx[key] = snap ? extractToolResultTextFromSnapshotRecord(snap) : "";
      }
      setRequestBodyOverrides(seedShared);
      setRequestBodyOverridesBySnapshotId(seedPer);
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
      setBodyOverridesSnapshotDraftRaw({});
      setBodyOverridesSnapshotJsonError({});
      setToolContextBySnapshotId(seedToolCtx);

      parityHydrationBaselineRef.current = {
        selectionKey,
        sharedOverrides: JSON.parse(JSON.stringify(seedShared)) as Record<string, unknown>,
        perLogOverrides: JSON.parse(JSON.stringify(seedPer)) as Record<
          string,
          Record<string, unknown>
        >,
        tools: baselineTools.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        toolContextBySnapshotId: JSON.parse(JSON.stringify(seedToolCtx)) as Record<string, string>,
      };

      setOverridesHydratedKey(selectionKey);
    }
  }, [
    selectedSnapshotIdsForRun,
    effectiveRepresentativeBaselineSnapshotId,
    baselineSeedSnapshot,
    baselinePayload,
    baselineSnapshotsById,
    baselineTools,
    runDataModel,
    runDataProvider,
    modelOverrideEnabled,
    toolsHydratedKey,
    overridesHydratedKey,
    setToolsList,
    setRequestBody,
    setNewModel,
    setReplayProvider,
    setModelProviderTab,
    setRequestJsonError,
    setRequestBodyOverrides,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setToolContextBySnapshotId,
  ]);

  const getParityHydrationSelectionKey = useCallback(() => {
    return `${selectedSnapshotIdsForRun.join(",")}|rep:${effectiveRepresentativeBaselineSnapshotId ?? ""}`;
  }, [selectedSnapshotIdsForRun, effectiveRepresentativeBaselineSnapshotId]);

  const resetParitySharedOverridesToBaseline = useCallback(() => {
    const h = parityHydrationBaselineRef.current;
    const key = getParityHydrationSelectionKey();
    if (!h || h.selectionKey !== key || selectedSnapshotIdsForRun.length === 0) return;
    setRequestBodyOverrides(JSON.parse(JSON.stringify(h.sharedOverrides)) as Record<string, unknown>);
    setBodyOverridesJsonDraft(null);
    setBodyOverridesJsonError("");
  }, [
    getParityHydrationSelectionKey,
    selectedSnapshotIdsForRun.length,
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
  ]);

  const resetParityPerLogOverridesToBaseline = useCallback(() => {
    const h = parityHydrationBaselineRef.current;
    const key = getParityHydrationSelectionKey();
    if (!h || h.selectionKey !== key || selectedSnapshotIdsForRun.length === 0) return;
    setRequestBodyOverridesBySnapshotId(
      JSON.parse(JSON.stringify(h.perLogOverrides)) as Record<string, Record<string, unknown>>
    );
    setBodyOverridesSnapshotDraftRaw({});
    setBodyOverridesSnapshotJsonError({});
  }, [
    getParityHydrationSelectionKey,
    selectedSnapshotIdsForRun.length,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
  ]);

  const resetParityToolsToBaseline = useCallback(() => {
    const h = parityHydrationBaselineRef.current;
    const key = getParityHydrationSelectionKey();
    if (!h || h.selectionKey !== key || selectedSnapshotIdsForRun.length === 0) return;
    setToolsList(h.tools.map(t => ({ ...t })));
  }, [getParityHydrationSelectionKey, selectedSnapshotIdsForRun.length, setToolsList]);

  const resetParityToolContextToBaseline = useCallback(() => {
    const h = parityHydrationBaselineRef.current;
    const key = getParityHydrationSelectionKey();
    if (!h || h.selectionKey !== key || selectedSnapshotIdsForRun.length === 0) return;
    setToolContextBySnapshotId(
      JSON.parse(JSON.stringify(h.toolContextBySnapshotId)) as Record<string, string>
    );
  }, [getParityHydrationSelectionKey, selectedSnapshotIdsForRun.length, setToolContextBySnapshotId]);

  return {
    overridesHydratedKey,
    setOverridesHydratedKey,
    getParityHydrationSelectionKey,
    resetParitySharedOverridesToBaseline,
    resetParityPerLogOverridesToBaseline,
    resetParityToolsToBaseline,
    resetParityToolContextToBaseline,
  };
}
