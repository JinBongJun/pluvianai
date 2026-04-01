"use client";

import { useMemo } from "react";
import useSWR from "swr";
import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { liveViewAPI } from "@/lib/api";
import { liveViewAgentsSwrKey } from "@/lib/laboratoryLabRefresh";

export function useReleaseGateAgents(options: { projectId: number; runLocked: boolean }) {
  const { projectId, runLocked } = options;

  const agentsKey =
    projectId && !isNaN(projectId) ? liveViewAgentsSwrKey(projectId) : null;
  const {
    data: agentsData,
    isLoading: agentsLoading,
    error: agentsError,
    mutate: mutateAgents,
  } = useSWR(
    agentsKey,
    () => liveViewAPI.getAgents(projectId, 50, true, true),
    {
      isPaused: () => runLocked,
    }
  );
  const agentsLoaded = agentsKey !== null && typeof agentsData !== "undefined";
  const agents = useMemo<AgentForPicker[]>(() => {
    const list = Array.isArray((agentsData as { agents?: unknown[] } | undefined)?.agents)
      ? ((agentsData as { agents: Array<{ agent_id?: string; display_name?: string; model?: string | null; is_deleted?: boolean }> }).agents)
      : [];
    return list
      .filter(a => !a?.is_deleted)
      .map(a => ({
        agent_id: a.agent_id ?? "",
        display_name: a.display_name || a.agent_id || "Agent",
        model: a.model ?? null,
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
