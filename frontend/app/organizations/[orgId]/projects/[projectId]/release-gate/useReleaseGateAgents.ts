"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { releaseGateAPI } from "@/lib/api";

export function useReleaseGateAgents(options: { projectId: number; runLocked: boolean }) {
  const { projectId, runLocked } = options;

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
    { isPaused: () => runLocked }
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
