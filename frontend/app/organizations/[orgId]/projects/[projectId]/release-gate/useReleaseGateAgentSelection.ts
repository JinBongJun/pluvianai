"use client";

import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { AgentForPicker } from "@/components/release-gate/AgentPickerCard";
import { getApiErrorCode, getApiErrorMessage, redirectToLogin } from "@/lib/api/client";

export type UseReleaseGateAgentSelectionParams = {
  agentId: string;
  agents: AgentForPicker[];
  agentsData: unknown;
  agentsLoading: boolean;
  agentsError: unknown;
  clearBodyOverrides: () => void;
  setAgentId: (id: string) => void;
  setSelectedAgent: Dispatch<SetStateAction<AgentForPicker | null>>;
  setDatasetIds: (ids: string[]) => void;
  setViewMode: (mode: "map" | "expanded") => void;
};

export function useReleaseGateAgentSelection(p: UseReleaseGateAgentSelectionParams) {
  const {
    agentId,
    agents,
    agentsData,
    agentsLoading,
    agentsError,
    clearBodyOverrides,
    setAgentId,
    setSelectedAgent,
    setDatasetIds,
    setViewMode,
  } = p;

  useEffect(() => {
    if (agentId && agents.length > 0) {
      const match = agents.find(a => a.agent_id === agentId);
      setSelectedAgent(prev => (prev?.agent_id === agentId ? prev : (match ?? null)));
    } else if (!agentId) {
      setSelectedAgent(null);
    }
  }, [agentId, agents, setSelectedAgent]);

  const onAgentSelect = useCallback(
    (agent: AgentForPicker) => {
      setAgentId(agent.agent_id);
      setSelectedAgent(agent);
      setDatasetIds([]);
      clearBodyOverrides();
      setViewMode("expanded");
    },
    [clearBodyOverrides, setAgentId, setDatasetIds, setSelectedAgent, setViewMode]
  );

  const onMapSelectAgent = useCallback(
    (selectedId: string) => {
      const agent = agents.find(a => a.agent_id === selectedId);
      if (agent) onAgentSelect(agent);
    },
    [agents, onAgentSelect]
  );

  const agentsErrorStatus = Number((agentsError as { response?: { status?: number } } | undefined)?.response?.status ?? 0);
  const agentsErrorCode = getApiErrorCode(agentsError);
  const showGateLoadingState = agentsLoading && typeof agentsData === "undefined";
  const showGateAccessDeniedState = !!agentsError && agentsErrorStatus === 403;
  const showGateApiErrorState =
    !!agentsError && agentsErrorStatus !== 401 && !showGateAccessDeniedState;
  const showGateEmptyState = false;

  useEffect(() => {
    if (agentsErrorStatus !== 401) return;
    redirectToLogin({
      code: agentsErrorCode,
      message: getApiErrorMessage(agentsError),
    });
  }, [agentsError, agentsErrorCode, agentsErrorStatus]);

  return {
    onMapSelectAgent,
    showGateLoadingState,
    showGateAccessDeniedState,
    showGateApiErrorState,
    showGateEmptyState,
  };
}
