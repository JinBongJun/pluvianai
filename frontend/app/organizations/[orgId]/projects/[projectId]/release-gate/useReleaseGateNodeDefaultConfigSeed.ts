"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { EditableTool, ReplayProvider } from "./releaseGatePageContent.lib";
import {
  extractToolsFromPayload,
  inferProviderFromModelId,
  normalizeReplayProvider,
  payloadWithoutModel,
  PROVIDER_PAYLOAD_TEMPLATES,
} from "./releaseGatePageContent.lib";

export type UseReleaseGateNodeDefaultConfigSeedParams = {
  agentId: string;
  selectedSnapshotIdsForRun: string[];
  baselineSeedSnapshot: Record<string, unknown> | null;
  baselinePayload: Record<string, unknown> | null;
  liveNodeLatestPayload: Record<string, unknown> | null;
  requestBody: Record<string, unknown>;
  toolsList: EditableTool[];
  runDataProvider: ReplayProvider | null;
  runDataModel: string;
  overridesHydratedKey: string;
  setOverridesHydratedKey: Dispatch<SetStateAction<string>>;
  setRequestBody: Dispatch<SetStateAction<Record<string, unknown>>>;
  setToolsList: Dispatch<SetStateAction<EditableTool[]>>;
};

/**
 * When a node is first selected (and no explicit baseline selection yet), seed the JSON payload
 * and tools list from the latest live snapshot (or provider template) so the panel shows a sensible default config.
 */
export function useReleaseGateNodeDefaultConfigSeed(p: UseReleaseGateNodeDefaultConfigSeedParams) {
  const {
    agentId,
    selectedSnapshotIdsForRun,
    baselineSeedSnapshot,
    baselinePayload,
    liveNodeLatestPayload,
    requestBody,
    toolsList,
    runDataProvider,
    runDataModel,
    overridesHydratedKey,
    setOverridesHydratedKey,
    setRequestBody,
    setToolsList,
  } = p;

  useEffect(() => {
    if (!agentId?.trim()) return;
    if (selectedSnapshotIdsForRun.length > 0) return;
    if (baselineSeedSnapshot || baselinePayload) return;
    if (overridesHydratedKey === `node:${agentId}`) return;

    if (Object.keys(requestBody).length > 0 || toolsList.length > 0) return;

    const providerTemplate = (() => {
      const prov = normalizeReplayProvider(runDataProvider) || inferProviderFromModelId(runDataModel);
      return prov ? PROVIDER_PAYLOAD_TEMPLATES[prov] : null;
    })();

    let seedBody: Record<string, unknown> | null = null;
    if (liveNodeLatestPayload) {
      const fromPayload = payloadWithoutModel(liveNodeLatestPayload);
      seedBody = providerTemplate ? { ...providerTemplate, ...fromPayload } : fromPayload;
    } else if (providerTemplate) {
      seedBody = { ...providerTemplate };
    }

    if (!seedBody || Object.keys(seedBody).length === 0) return;
    setRequestBody(seedBody);

    const seedTools = liveNodeLatestPayload ? extractToolsFromPayload(liveNodeLatestPayload) : [];
    if (seedTools.length) setToolsList(seedTools);

    setOverridesHydratedKey(`node:${agentId}`);
  }, [
    agentId,
    selectedSnapshotIdsForRun.length,
    baselineSeedSnapshot,
    baselinePayload,
    liveNodeLatestPayload,
    requestBody,
    toolsList.length,
    runDataProvider,
    runDataModel,
    overridesHydratedKey,
    setOverridesHydratedKey,
    setRequestBody,
    setToolsList,
  ]);
}
