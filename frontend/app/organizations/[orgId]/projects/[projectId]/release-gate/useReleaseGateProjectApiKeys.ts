"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";

import { projectUserApiKeysAPI } from "@/lib/api";
import {
  describeMissingProviderKeys,
  inferProviderFromModelId,
  isHostedPlatformModel,
  normalizeReplayProvider,
  type ReplayProvider,
} from "./releaseGatePageContent.lib";
import type { ReleaseGateReplayModelMode } from "./releaseGateReplayConstants";

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
  modelOverrideEnabled: boolean;
  /** When override is on: hosted = platform credits; custom = always BYOK/detected path. */
  replayModelMode: ReleaseGateReplayModelMode;
  newModel: string;
  replayProvider: ReplayProvider;
  replayUserApiKeyId: number | null;
  baselineSnapshotsForRun: Record<string, unknown>[];
  runDataProvider: ReplayProvider | null;
  agentId: string;
};

export function useReleaseGateProjectApiKeys(p: UseReleaseGateProjectApiKeysParams) {
  const {
    projectId,
    runLocked,
    canValidate,
    modelOverrideEnabled,
    replayModelMode,
    newModel,
    replayProvider,
    replayUserApiKeyId,
    baselineSnapshotsForRun,
    runDataProvider,
    agentId,
  } = p;

  const projectUserApiKeysKey =
    projectId && !isNaN(projectId) ? ["project-user-api-keys", projectId] : null;
  const { data: projectUserApiKeysData, isLoading: projectUserApiKeysLoading } = useSWR(
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
      modelOverrideEnabled &&
      replayModelMode === "hosted" &&
      replayProvider &&
      isHostedPlatformModel(replayProvider, newModel)
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
    modelOverrideEnabled,
    replayModelMode,
    replayProvider,
    newModel,
    baselineSnapshotsForRun,
    runDataProvider,
  ]);

  const missingProviderKeys = useMemo(() => {
    if (
      modelOverrideEnabled &&
      replayModelMode === "hosted" &&
      isHostedPlatformModel(replayProvider, newModel)
    ) {
      return [];
    }
    if (modelOverrideEnabled && newModel.trim() && replayUserApiKeyId != null) return [];
    if (
      modelOverrideEnabled &&
      newModel.trim() &&
      (replayModelMode === "custom" || !isHostedPlatformModel(replayProvider, newModel))
    ) {
      if (!hasEffectiveProviderKey(replayProvider, agentId.trim() || null)) {
        return [replayProvider];
      }
      return [];
    }
    const missing = new Set<ReplayProvider>();
    for (const snapshot of baselineSnapshotsForRun) {
      const provider =
        normalizeReplayProvider((snapshot as Record<string, unknown>).provider) ||
        inferProviderFromModelId((snapshot as Record<string, unknown>).model);
      if (!provider) continue;
      const snapshotAgentIdRaw = (snapshot as Record<string, unknown>).agent_id;
      const snapshotAgentId = typeof snapshotAgentIdRaw === "string" ? snapshotAgentIdRaw : null;
      if (!hasEffectiveProviderKey(provider, snapshotAgentId)) {
        missing.add(provider);
      }
    }
    if (missing.size === 0 && requiredProviderResolution.providers.length > 0 && runDataProvider) {
      if (!hasEffectiveProviderKey(runDataProvider, agentId.trim() || null)) {
        missing.add(runDataProvider);
      }
    }
    return Array.from(missing);
  }, [
    modelOverrideEnabled,
    replayModelMode,
    newModel,
    replayUserApiKeyId,
    replayProvider,
    baselineSnapshotsForRun,
    requiredProviderResolution.providers.length,
    runDataProvider,
    hasEffectiveProviderKey,
    agentId,
  ]);

  const keyRegistrationMessage = useMemo(() => {
    if (!canValidate) return "";
    if (
      modelOverrideEnabled &&
      replayModelMode === "hosted" &&
      isHostedPlatformModel(replayProvider, newModel)
    ) {
      return "";
    }
    if (projectUserApiKeysLoading) return "Checking required API keys...";
    if (requiredProviderResolution.providers.length === 0) {
      return "Run blocked: provider could not be detected from selected data. Open Live View and verify the latest agent snapshot.";
    }
    if (requiredProviderResolution.unresolvedSnapshotCount > 0) {
      return "Run blocked: one or more selected snapshots have no detectable provider. Open Live View and verify the latest agent snapshot.";
    }
    if (missingProviderKeys.length > 0) {
      return describeMissingProviderKeys(missingProviderKeys);
    }
    return "All required API keys are registered. Ready to run.";
  }, [
    canValidate,
    modelOverrideEnabled,
    replayModelMode,
    newModel,
    replayProvider,
    projectUserApiKeysLoading,
    requiredProviderResolution.providers.length,
    requiredProviderResolution.unresolvedSnapshotCount,
    missingProviderKeys,
  ]);

  const keyBlocked =
    canValidate &&
    (projectUserApiKeysLoading ||
      requiredProviderResolution.providers.length === 0 ||
      requiredProviderResolution.unresolvedSnapshotCount > 0 ||
      missingProviderKeys.length > 0);

  const projectUserApiKeysForUi = useMemo((): ProjectUserApiKeyItem[] => {
    return Array.isArray(projectUserApiKeysData)
      ? (projectUserApiKeysData as ProjectUserApiKeyItem[])
      : [];
  }, [projectUserApiKeysData]);

  return {
    keyBlocked,
    keyRegistrationMessage,
    projectUserApiKeysForUi,
  };
}
