"use client";

import type { MutableRefObject } from "react";
import { useRef } from "react";
import useSWR from "swr";

import { liveViewAPI } from "@/lib/api";
import { useLaboratoryPageBootstrap } from "@/hooks/useLaboratoryPageBootstrap";
import { liveViewAgentsSwrKey } from "@/lib/laboratoryLabRefresh";

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
  const lastAgentsSuccessAtRef = useRef(0);

  const { project, org, organizations, orgProjects, projectSummary } = useLaboratoryPageBootstrap({
    orgId,
    projectId,
    routerReplace,
    swrOptions: LIVE_VIEW_SWR_DEFAULT_OPTIONS,
    deferSwitcherData: true,
  });

  const {
    data: agentsData,
    mutate: mutateAgents,
    isLoading: agentsLoading,
    error: agentsError,
  } = useSWR(
    projectId && !isNaN(projectId) && projectId > 0 ? liveViewAgentsSwrKey(projectId) : null,
    () => liveViewAPI.getAgents(projectId, 50, true, true),
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
      onSuccess: () => {
        lastAgentsSuccessAtRef.current = Date.now();
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
    agentsLastUpdatedAt: lastAgentsSuccessAtRef.current,
  };
}
