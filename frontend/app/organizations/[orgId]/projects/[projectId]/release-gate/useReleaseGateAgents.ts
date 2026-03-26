"use client";

import { useEffect, useMemo, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { releaseGateAPI } from "@/lib/api";
import {
  liveViewAgentsSwrKey,
  releaseGateAgentsPayloadSignature,
} from "@/lib/laboratoryLabRefresh";

export function useReleaseGateAgents(options: { projectId: number; runLocked: boolean }) {
  const { projectId, runLocked } = options;

  const { mutate: cacheMutate } = useSWRConfig();
  const lastRgAgentsSigRef = useRef<string | null>(null);

  useEffect(() => {
    lastRgAgentsSigRef.current = null;
  }, [projectId]);

  const agentsKey =
    projectId && !isNaN(projectId) ? ["release-gate-agents", projectId] : null;
  const {
    data: agentsData,
    isLoading: agentsLoading,
    error: agentsError,
    mutate: mutateAgents,
  } = useSWR(
    agentsKey,
    () => releaseGateAPI.getAgents(projectId, 50),
    {
      isPaused: () => runLocked,
      onSuccess: (data: unknown) => {
        if (!projectId || projectId <= 0 || Number.isNaN(projectId)) return;
        const sig = releaseGateAgentsPayloadSignature(data);
        if (
          lastRgAgentsSigRef.current !== null &&
          sig === lastRgAgentsSigRef.current
        ) {
          return;
        }
        lastRgAgentsSigRef.current = sig;
        void cacheMutate(liveViewAgentsSwrKey(projectId));
      },
    }
  );
  const agentsLoaded = agentsKey !== null && typeof agentsData !== "undefined";
  const agents = useMemo<AgentForPicker[]>(() => {
    const list = agentsData?.items ?? [];
    return list
      .map((a: { agent_id?: string; display_name?: string }) => ({
        agent_id: a.agent_id ?? "",
        display_name: a.display_name || a.agent_id || "Agent",
        model: null,
        worst_count: 0,
        is_ghost: false,
      }))
      .filter((a: AgentForPicker) => a.agent_id);
  }, [agentsData]);

  return {
    agentsKey,
    agentsData,
    agentsLoading,
    agentsError,
    mutateAgents,
    agentsLoaded,
    agents,
  };
}
