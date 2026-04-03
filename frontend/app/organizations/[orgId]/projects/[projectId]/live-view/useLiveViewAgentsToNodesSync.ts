"use client";

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { Node } from "reactflow";

import { buildGraphAgentDigest } from "@/lib/react-flow/agentDigest";
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
  setNodes: SetNodes;
  resetHistory: () => void;
  initializeHistory: (nodes: Node[]) => void;
  isDraggingRef: MutableRefObject<boolean>;
  requestIdleFit: () => void;
}) {
  const {
    projectId,
    agentsData,
    agentsList,
    selectedAgentId,
    setNodes,
    resetHistory,
    initializeHistory,
    isDraggingRef,
    requestIdleFit,
  } = options;

  const prevAgentIdsRef = useRef<Set<string>>(new Set());
  const prevAgentsVisualSignatureRef = useRef<string | null>(null);
  const agentsSyncProjectIdRef = useRef<number | null>(null);

  const agentsDigest = buildGraphAgentDigest(agentsList);

  useEffect(() => {
    if (typeof agentsData === "undefined") return;

    if (agentsSyncProjectIdRef.current !== projectId) {
      agentsSyncProjectIdRef.current = projectId;
      prevAgentIdsRef.current = new Set();
      prevAgentsVisualSignatureRef.current = null;
    }

    if (agentsList.length === 0) {
      prevAgentIdsRef.current = new Set();
      prevAgentsVisualSignatureRef.current = agentsDigest;
      resetHistory();
      setNodes([]);
      return;
    }

    const saved = loadLvPositions(projectId);
    const currentAgentIds = new Set(agentsList.map(agent => String(agent.agent_id)));
    const prevAgentIds = prevAgentIdsRef.current;
    const samePayload = prevAgentsVisualSignatureRef.current === agentsDigest;
    prevAgentsVisualSignatureRef.current = agentsDigest;

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

    if ((hasNewAgents || firstAgentPopulation) && !isDraggingRef.current && !selectedAgentId) {
      requestIdleFit();
    }
  }, [
    agentsData,
    agentsList,
    agentsDigest,
    selectedAgentId,
    projectId,
    setNodes,
    resetHistory,
    initializeHistory,
    isDraggingRef,
    requestIdleFit,
  ]);

  useEffect(() => {
    if (isDraggingRef.current) return;
    setNodes(current => syncNodeSelectionState(current, selectedAgentId));
  }, [selectedAgentId, setNodes, isDraggingRef]);
}
