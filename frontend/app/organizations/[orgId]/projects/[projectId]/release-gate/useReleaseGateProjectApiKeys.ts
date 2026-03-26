"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";

import { projectUserApiKeysAPI } from "@/lib/api";
import {
  describeMissingProviderKeyRequirements,
  inferProviderFromModelId,
  isHostedPlatformModel,
  normalizeReplayProvider,
  type ReplayProvider,
  type MissingProviderKeyRequirement,
} from "./releaseGatePageContent.lib";
import { REPLAY_PROVIDER_LABEL, type ReleaseGateModelSource } from "./releaseGateReplayConstants";

export type ProjectUserApiKeyItem = {
  id: number;
  provider: string;
  agent_id?: string | null;
  is_active: boolean;
  name?: string | null;
  created_at?: string | null;
};

export type UseReleaseGateProjectApiKeysParams = {
  projectId: number;
  runLocked: boolean;
  canValidate: boolean;
  modelSource: ReleaseGateModelSource;
  newModel: string;
  replayProvider: ReplayProvider;
  replayUserApiKeyId: number | null;
  replayApiKey: string;
  baselineSnapshotsForRun: Record<string, unknown>[];
  runDataProvider: ReplayProvider | null;
  agentId: string;
};

export function useReleaseGateProjectApiKeys(p: UseReleaseGateProjectApiKeysParams) {
  const {
    projectId,
    runLocked,
    canValidate,
    modelSource,
    newModel,
    replayProvider,
    replayUserApiKeyId,
    replayApiKey,
    baselineSnapshotsForRun,
    runDataProvider,
    agentId,
  } = p;

  const projectUserApiKeysKey =
    projectId && !isNaN(projectId) ? ["project-user-api-keys", projectId] : null;
  const {
    data: projectUserApiKeysData,
    isLoading: projectUserApiKeysLoading,
    mutate: mutateProjectUserApiKeys,
  } = useSWR(
    projectUserApiKeysKey,
    () => projectUserApiKeysAPI.list(projectId),
    { isPaused: () => runLocked }
  );

  const keyPresenceByAgentAndProvider = useMemo(() => {
    const projectDefaultProviders = new Set<ReplayProvider>();
    const nodeScopedProviders = new Set<string>();
    const items = Array.isArray(projectUserApiKeysData)
      ? (projectUserApiKeysData as ProjectUserApiKeyItem[])
      : [];
    for (const item of items) {
      if (!item?.is_active) continue;
      const normalized = normalizeReplayProvider(item.provider);
      if (!normalized) continue;
      const keyAgentId = (item.agent_id || "").trim();
      if (!keyAgentId) {
        projectDefaultProviders.add(normalized);
        continue;
      }
      nodeScopedProviders.add(`${keyAgentId}::${normalized}`);
    }
    return {
      projectDefaultProviders,
      nodeScopedProviders,
    };
  }, [projectUserApiKeysData]);

  const hasEffectiveProviderKey = useCallback(
    (provider: ReplayProvider, keyAgentId: string | null) => {
      const normalizedAgentId = (keyAgentId || "").trim();
      if (
        normalizedAgentId &&
        keyPresenceByAgentAndProvider.nodeScopedProviders.has(`${normalizedAgentId}::${provider}`)
      ) {
        return true;
      }
      return keyPresenceByAgentAndProvider.projectDefaultProviders.has(provider);
    },
    [keyPresenceByAgentAndProvider]
  );

  const requiredProviderResolution = useMemo(() => {
    if (
      (modelSource === "hosted" && replayProvider && isHostedPlatformModel(replayProvider, newModel)) ||
      (modelSource === "custom" && replayProvider)
    ) {
      return {
        providers: [replayProvider],
        unresolvedSnapshotCount: 0,
      };
    }
    const providers = new Set<ReplayProvider>();
    let unresolvedSnapshotCount = 0;
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) {
        unresolvedSnapshotCount += 1;
        continue;
      }
      providers.add(provider);
    }
    if (providers.size === 0 && runDataProvider) providers.add(runDataProvider);
    return {
      providers: Array.from(providers),
      unresolvedSnapshotCount,
    };
  }, [
    modelSource,
    replayProvider,
    newModel,
    baselineSnapshotsForRun,
    runDataProvider,
  ]);

  const missingProviderRequirements = useMemo((): MissingProviderKeyRequirement[] => {
    if (
      modelSource === "hosted" &&
      isHostedPlatformModel(replayProvider, newModel)
    ) {
      return [];
    }
    if (modelSource === "custom" && replayApiKey.trim()) return [];
    if (modelSource === "custom" && replayUserApiKeyId != null) return [];
    if (modelSource === "custom") {
      if (!hasEffectiveProviderKey(replayProvider, agentId.trim() || null)) {
        return [{ provider: replayProvider, agentId: agentId.trim() || null }];
      }
      return [];
    }
    const missing = new Map<string, MissingProviderKeyRequirement>();
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) continue;
      const snapshotAgentIdRaw = (snapshot as Record<string, unknown>).agent_id;
      const snapshotAgentId = typeof snapshotAgentIdRaw === "string" ? snapshotAgentIdRaw : null;
      if (!hasEffectiveProviderKey(provider, snapshotAgentId)) {
        const key = `${provider}::${snapshotAgentId || ""}`;
        if (!missing.has(key)) {
          missing.set(key, { provider, agentId: snapshotAgentId });
        }
      }
    }
    if (missing.size === 0 && requiredProviderResolution.providers.length > 0 && runDataProvider) {
      if (!hasEffectiveProviderKey(runDataProvider, agentId.trim() || null)) {
        missing.set(`${runDataProvider}::${agentId.trim() || ""}`, {
          provider: runDataProvider,
          agentId: agentId.trim() || null,
        });
      }
    }
    return Array.from(missing.values());
  }, [
    modelSource,
    newModel,
    replayUserApiKeyId,
    replayApiKey,
    replayProvider,
    baselineSnapshotsForRun,
    requiredProviderResolution.providers.length,
    runDataProvider,
    hasEffectiveProviderKey,
    agentId,
  ]);

  const missingProviderKeyDetails = useMemo(
    () =>
      missingProviderRequirements.map(req => {
        const providerLabel = REPLAY_PROVIDER_LABEL[req.provider];
        return req.agentId?.trim()
          ? `${providerLabel} key missing for node ${req.agentId.trim()}`
          : `${providerLabel} key missing for the selected baseline logs`;
      }),
    [missingProviderRequirements]
  );

  const keyRegistrationMessage = useMemo(() => {
    if (
      modelSource === "hosted" &&
      isHostedPlatformModel(replayProvider, newModel)
    ) {
      return "PluvianAI hosted model — no separate provider API key is required for this run.";
    }
    if (projectUserApiKeysLoading) return "Checking required API keys...";
    if (requiredProviderResolution.providers.length === 0) {
      return "Run blocked: provider could not be detected from selected data. Open Live View and verify the latest agent snapshot.";
    }
    if (requiredProviderResolution.unresolvedSnapshotCount > 0) {
      return "Run blocked: one or more selected snapshots have no detectable provider. Open Live View and verify the latest agent snapshot.";
    }
    if (missingProviderRequirements.length > 0) {
      return describeMissingProviderKeyRequirements(missingProviderRequirements, {
        allowDirectApiKey: modelSource === "custom",
      });
    }
    if (modelSource === "custom" && replayApiKey.trim()) {
      return "Direct API key provided for this custom run. Ready to run.";
    }
    return "All required API keys are registered. Ready to run.";
  }, [
    modelSource,
    newModel,
    replayApiKey,
    replayProvider,
    projectUserApiKeysLoading,
    requiredProviderResolution.providers.length,
    requiredProviderResolution.unresolvedSnapshotCount,
    missingProviderRequirements,
  ]);

  /** Key requirements fail (loading, undetectable provider, or missing registered key). Independent of run selection. */
  const keyIssueBlocked =
    projectUserApiKeysLoading ||
    requiredProviderResolution.providers.length === 0 ||
    requiredProviderResolution.unresolvedSnapshotCount > 0 ||
    missingProviderRequirements.length > 0;

  /** Blocks validate only when the run is otherwise ready to start (baseline/dataset selection + agent). */
  const keyBlocked = canValidate && keyIssueBlocked;

  const projectUserApiKeysForUi = useMemo((): ProjectUserApiKeyItem[] => {
    return Array.isArray(projectUserApiKeysData)
      ? (projectUserApiKeysData as ProjectUserApiKeyItem[])
      : [];
  }, [projectUserApiKeysData]);

  return {
    keyBlocked,
    keyIssueBlocked,
    keyRegistrationMessage,
    missingProviderKeyDetails,
    projectUserApiKeysForUi,
    mutateProjectUserApiKeys,
  };
}
