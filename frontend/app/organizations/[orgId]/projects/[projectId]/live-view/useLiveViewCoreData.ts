"use client";

import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";

import { liveViewAPI } from "@/lib/api";
import { useLaboratoryPageBootstrap } from "@/hooks/useLaboratoryPageBootstrap";
import {
  liveViewAgentsPayloadSignature,
  releaseGateAgentsSwrKey,
} from "@/lib/laboratoryLabRefresh";

import {
  LIVE_VIEW_FOCUSED_POLL_MS,
  LIVE_VIEW_MAX_POLL_MS,
} from "./liveViewPolling.constants";
import { LIVE_VIEW_SWR_DEFAULT_OPTIONS } from "./liveViewSwr.defaults";

/** Project + org + Live View agents list (SWR). See `docs/live-view-rg-polling-inventory.md`. */
export function useLiveViewCoreData(options: {
  projectId: number;
  orgId: string;
  routerReplace: (href: string) => void;
  selectedAgentId: string | null;
  agentsPollIntervalMs: number;
  isPageVisible: boolean;
  sseConnected: boolean;
  sseBackoffUntilRef: MutableRefObject<number>;
}) {
  const {
    projectId,
    orgId,
    routerReplace,
    selectedAgentId,
    agentsPollIntervalMs,
    isPageVisible,
    sseConnected,
    sseBackoffUntilRef,
  } = options;

  const { mutate: cacheMutate } = useSWRConfig();
  const lastLvAgentsSigRef = useRef<string | null>(null);

  useEffect(() => {
    lastLvAgentsSigRef.current = null;
  }, [projectId]);

  const { project, org, organizations, orgProjects, projectSummary } = useLaboratoryPageBootstrap({
    orgId,
    projectId,
    routerReplace,
    swrOptions: LIVE_VIEW_SWR_DEFAULT_OPTIONS,
  });

  const {
    data: agentsData,
    mutate: mutateAgents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useSWR(
    projectId && !isNaN(projectId) && projectId > 0 ? ["live-view-agents", projectId] : null,
    () => liveViewAPI.getAgents(projectId, 30, true, true),
    {
      refreshInterval: (() => {
        if (!isPageVisible) return 0;
        if (sseConnected) return 0;
        if (Date.now() < sseBackoffUntilRef.current) return LIVE_VIEW_MAX_POLL_MS;
        return selectedAgentId
          ? Math.min(agentsPollIntervalMs, LIVE_VIEW_FOCUSED_POLL_MS)
          : agentsPollIntervalMs;
      })(),
      shouldRetryOnError: false,
      onSuccess: (data: unknown) => {
        if (!projectId || projectId <= 0 || Number.isNaN(projectId)) return;
        const sig = liveViewAgentsPayloadSignature(data);
        if (
          lastLvAgentsSigRef.current !== null &&
          sig === lastLvAgentsSigRef.current
        ) {
          return;
        }
        lastLvAgentsSigRef.current = sig;
        void cacheMutate(releaseGateAgentsSwrKey(projectId));
      },
      ...LIVE_VIEW_SWR_DEFAULT_OPTIONS,
    }
  );

  return {
    project,
    projectSummary,
    org,
    organizations,
    orgProjects,
    agentsData,
    agentsLoading,
    agentsError,
    mutateAgents,
  };
}
