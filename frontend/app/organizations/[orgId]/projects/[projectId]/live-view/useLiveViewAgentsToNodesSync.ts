"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import type { Node } from "reactflow";

import { syncNodeSelectionState } from "@/lib/react-flow/graphNodes";
import { loadLvPositions } from "./liveViewGraphLayout";
import {
  mapAgentsToLiveViewNodes,
  type LiveViewAgentRow,
} from "./mapAgentsToLiveViewNodes";

type SetNodes = (
  updater: Node[] | ((currentNodes: Node[]) => Node[])
) => void;

export function useLiveViewAgentsToNodesSync(options: {
  projectId: number;
  agentsData: unknown;
  agentsList: LiveViewAgentRow[];
  selectedAgentId: string | null;
  fitView: (options?: { duration?: number; padding?: number }) => void;
  setNodes: SetNodes;
  resetHistory: () => void;
  initializeHistory: (nodes: Node[]) => void;
  isDraggingRef: MutableRefObject<boolean>;
}) {
  const {
    projectId,
    agentsData,
    agentsList,
    selectedAgentId,
    fitView,
    setNodes,
    resetHistory,
    initializeHistory,
    isDraggingRef,
  } = options;

  const prevAgentIdsRef = useRef<Set<string>>(new Set());
  const prevAgentsVisualSignatureRef = useRef<string | null>(null);
  const agentsSyncProjectIdRef = useRef<number | null>(null);

  const agentsVisualSignature = useMemo(() => JSON.stringify(agentsList), [agentsList]);

  useEffect(() => {
    if (typeof agentsData === "undefined") return;

    if (agentsSyncProjectIdRef.current !== projectId) {
      agentsSyncProjectIdRef.current = projectId;
      prevAgentIdsRef.current = new Set();
      prevAgentsVisualSignatureRef.current = null;
    }

    if (agentsList.length === 0) {
      prevAgentIdsRef.current = new Set();
      prevAgentsVisualSignatureRef.current = agentsVisualSignature;
      resetHistory();
      setNodes([]);
      return;
    }

    const saved = loadLvPositions(projectId);
    const currentAgentIds = new Set(agentsList.map(agent => String(agent.agent_id)));
    const prevAgentIds = prevAgentIdsRef.current;
    const samePayload = prevAgentsVisualSignatureRef.current === agentsVisualSignature;
    prevAgentsVisualSignatureRef.current = agentsVisualSignature;

    if (prevAgentIds.size > 0) {
      const sameAgentSet =
        prevAgentIds.size === currentAgentIds.size &&
        Array.from(currentAgentIds).every(id => prevAgentIds.has(id));
      if (sameAgentSet && samePayload) {
        return;
      }
      if (!sameAgentSet) {
        resetHistory();
      }
    }

    const hasNewAgents =
      prevAgentIds.size > 0 &&
      Array.from(currentAgentIds).some(id => !prevAgentIds.has(id));
    const firstAgentPopulation = prevAgentIds.size === 0 && currentAgentIds.size > 0;
    prevAgentIdsRef.current = currentAgentIds;

    setNodes(currentNodes => {
      const updatedNodes = mapAgentsToLiveViewNodes({
        agentsList,
        selectedAgentId,
        currentNodes,
        saved,
      });
      initializeHistory(updatedNodes);
      return updatedNodes;
    });

    if ((hasNewAgents || firstAgentPopulation) && !isDraggingRef.current) {
      setTimeout(() => fitView({ duration: 600, padding: 0.2 }), 50);
    }
  }, [
    agentsData,
    agentsList,
    agentsVisualSignature,
    selectedAgentId,
    projectId,
    fitView,
    setNodes,
    resetHistory,
    initializeHistory,
    isDraggingRef,
  ]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes(current => syncNodeSelectionState(current, selectedAgentId));
  }, [selectedAgentId, setNodes, isDraggingRef]);
}
