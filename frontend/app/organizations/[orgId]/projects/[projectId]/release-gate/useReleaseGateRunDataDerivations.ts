"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  behaviorAPI,
  liveViewAPI,
  releaseGateAPI,
} from "@/lib/api";
import {
  buildRunEvalElementsFromAgentEval,
  DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY,
  asPayloadObject,
  extractSystemPromptFromPayload,
  extractToolsFromPayload,
  getRequestPart,
  inferProviderFromModelId,
  normalizeReplayProvider,
  PROVIDER_PAYLOAD_TEMPLATES,
  type ReplayProvider,
} from "./releaseGatePageContent.lib";

export type BaselineSeedSnapshot = Record<string, unknown> | null | undefined;

export type UseReleaseGateRunDataDerivationsParams = {
  projectId: number;
  agentId: string;
  selectedRunId: string | null;
  runLocked: boolean;
  baselineSeedSnapshot: BaselineSeedSnapshot;
  runSnapshotIds: string[];
  runDatasetIds: string[];
};

/**
 * Core-models + report + agent-eval + live-node SWR, and derived replay/baseline fields (§5b).
 */
export function useReleaseGateRunDataDerivations(p: UseReleaseGateRunDataDerivationsParams) {
  const {
    projectId,
    agentId,
    selectedRunId,
    runLocked,
    baselineSeedSnapshot,
    runSnapshotIds,
    runDatasetIds,
  } = p;

  const { data: coreModelsData } = useSWR(
    agentId?.trim() && projectId && !isNaN(projectId)
      ? ["release-gate-core-models", projectId]
      : null,
    () => releaseGateAPI.getCoreModels(projectId),
    { isPaused: () => runLocked }
  );

  const {
    data: selectedRunReport,
    isLoading: selectedRunReportLoading,
    error: selectedRunReportError,
  } = useSWR(
    selectedRunId && projectId && !isNaN(projectId)
      ? ["release-gate-report", projectId, selectedRunId]
      : null,
    () => behaviorAPI.exportReport(projectId, selectedRunId!, "json"),
    { isPaused: () => runLocked }
  );

  const singleSnapshotEvalKey =
    agentId?.trim() && projectId && !isNaN(projectId) ? ["agent-eval", projectId, agentId] : null;
  const { data: agentEvalData } = useSWR(
    singleSnapshotEvalKey,
    () => liveViewAPI.getAgentEvaluation(projectId, agentId),
    { isPaused: () => runLocked }
  );

  const liveNodeLatestKey =
    agentId?.trim() && projectId && !isNaN(projectId)
      ? ["release-gate-live-node-latest", projectId, agentId.trim()]
      : null;
  const { data: liveNodeLatestData } = useSWR(
    liveNodeLatestKey,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: agentId.trim(), limit: 1, offset: 0 }),
    { isPaused: () => runLocked }
  );

  const liveNodeLatestSnapshot = useMemo(() => {
    const items = (liveNodeLatestData as Record<string, unknown> | undefined)?.items;
    if (!Array.isArray(items) || items.length === 0) return null;
    const first = items[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }, [liveNodeLatestData]);

  const liveNodeLatestPayload = useMemo(() => {
    const raw = asPayloadObject(liveNodeLatestSnapshot?.payload);
    return raw ? getRequestPart(raw) : null;
  }, [liveNodeLatestSnapshot]);

  const baselinePayload = useMemo(() => {
    const raw = asPayloadObject(baselineSeedSnapshot?.payload);
    return raw ? getRequestPart(raw) : null;
  }, [baselineSeedSnapshot]);

  const baselineTools = useMemo(() => extractToolsFromPayload(baselinePayload), [baselinePayload]);

  const runDataModel = useMemo(() => {
    const latestModel = liveNodeLatestSnapshot?.model;
    if (typeof latestModel === "string" && latestModel.trim()) return latestModel.trim();
    const fromSnapshot = baselineSeedSnapshot?.model;
    if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
    const latestPayloadModel = liveNodeLatestPayload?.model;
    if (typeof latestPayloadModel === "string" && latestPayloadModel.trim())
      return latestPayloadModel.trim();
    const fromPayload = baselinePayload?.model;
    if (typeof fromPayload === "string" && fromPayload.trim()) return fromPayload.trim();
    return "";
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, liveNodeLatestPayload, baselinePayload]);

  const replayProviderModelLibrary = useMemo(() => {
    const providers = (coreModelsData as { providers?: Record<string, unknown> } | undefined)
      ?.providers;
    if (!providers || typeof providers !== "object") {
      return DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY;
    }
    const normalized: Record<ReplayProvider, string[]> = {
      openai: Array.isArray(providers.openai)
        ? providers.openai.map(v => String(v)).filter(Boolean)
        : [],
      anthropic: Array.isArray(providers.anthropic)
        ? providers.anthropic.map(v => String(v)).filter(Boolean)
        : [],
      google: Array.isArray(providers.google)
        ? providers.google.map(v => String(v)).filter(Boolean)
        : [],
    };
    return {
      openai: normalized.openai.length
        ? normalized.openai
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.openai,
      anthropic: normalized.anthropic.length
        ? normalized.anthropic
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.anthropic,
      google: normalized.google.length
        ? normalized.google
        : DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY.google,
    };
  }, [coreModelsData]);

  const runDataProvider = useMemo(() => {
    const fromLatest = normalizeReplayProvider(liveNodeLatestSnapshot?.provider);
    if (fromLatest) return fromLatest;
    const fromBaseline = normalizeReplayProvider(
      (baselineSeedSnapshot as Record<string, unknown> | null | undefined)?.provider
    );
    if (fromBaseline) return fromBaseline;
    return inferProviderFromModelId(runDataModel);
  }, [liveNodeLatestSnapshot, baselineSeedSnapshot, runDataModel]);

  const runDataPrompt = useMemo(() => {
    const latestPrompt = liveNodeLatestSnapshot?.system_prompt;
    if (typeof latestPrompt === "string" && latestPrompt.trim()) return latestPrompt.trim();
    const extractedFromLatestPayload = extractSystemPromptFromPayload(liveNodeLatestPayload);
    if (extractedFromLatestPayload) return extractedFromLatestPayload;
    const fromSnapshot = baselineSeedSnapshot?.system_prompt;
    if (typeof fromSnapshot === "string" && fromSnapshot.trim()) return fromSnapshot.trim();
    return extractSystemPromptFromPayload(baselinePayload);
  }, [liveNodeLatestSnapshot, liveNodeLatestPayload, baselineSeedSnapshot, baselinePayload]);

  const nodeBasePayload = useMemo(() => {
    if (baselinePayload) return baselinePayload;
    if (liveNodeLatestPayload) return liveNodeLatestPayload;
    const provider =
      normalizeReplayProvider(runDataProvider) || inferProviderFromModelId(runDataModel);
    if (!provider) return null;
    const providerTemplate = PROVIDER_PAYLOAD_TEMPLATES[provider];
    return providerTemplate ? { ...providerTemplate } : null;
  }, [baselinePayload, liveNodeLatestPayload, runDataProvider, runDataModel]);

  const configSourceLabel = useMemo(() => {
    if (runSnapshotIds.length > 0 && baselinePayload) return "Selected live logs";
    if (runDatasetIds.length > 0 && baselinePayload) return "Selected saved data";
    if (liveNodeLatestPayload) return "Latest live snapshot";
    if (nodeBasePayload) return "Provider template";
    return "";
  }, [
    runSnapshotIds.length,
    runDatasetIds.length,
    baselinePayload,
    liveNodeLatestPayload,
    nodeBasePayload,
  ]);

  const runEvalElements = useMemo(
    () => buildRunEvalElementsFromAgentEval(agentEvalData),
    [agentEvalData]
  );

  return useMemo(
    () => ({
      coreModelsData,
      selectedRunReport,
      selectedRunReportLoading,
      selectedRunReportError,
      agentEvalData,
      liveNodeLatestSnapshot,
      liveNodeLatestPayload,
      baselinePayload,
      baselineTools,
      runDataModel,
      replayProviderModelLibrary,
      runDataProvider,
      runDataPrompt,
      nodeBasePayload,
      configSourceLabel,
      runEvalElements,
    }),
    [
      coreModelsData,
      selectedRunReport,
      selectedRunReportLoading,
      selectedRunReportError,
      agentEvalData,
      liveNodeLatestSnapshot,
      liveNodeLatestPayload,
      baselinePayload,
      baselineTools,
      runDataModel,
      replayProviderModelLibrary,
      runDataProvider,
      runDataPrompt,
      nodeBasePayload,
      configSourceLabel,
      runEvalElements,
    ]
  );
}

export type ReleaseGateRunDataDerivationsBundle = ReturnType<
  typeof useReleaseGateRunDataDerivations
>;
