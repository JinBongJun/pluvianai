import type { Node } from "reactflow";

import { LV_GRID_COLS, LV_GRID_SPACING_X, LV_GRID_SPACING_Y } from "./liveViewGraphLayout";

export type LiveViewAgentRow = {
  agent_id: string;
  display_name?: string;
  model?: string;
  total?: number;
  worst_count?: number;
  is_official?: boolean;
  is_ghost?: boolean;
  drift_status?: string;
  signals?: unknown;
  node_type?: string;
};

export type MapAgentsToLiveViewNodesParams = {
  agentsList: LiveViewAgentRow[];
  selectedAgentId: string | null;
  currentNodes: Node[];
  saved: Record<string, { x: number; y: number }>;
  gridSpacingX?: number;
  gridSpacingY?: number;
  gridCols?: number;
};

/**
 * Builds React Flow nodes from the agents API list, preserving existing positions when possible.
 */
export function mapAgentsToLiveViewNodes({
  agentsList,
  selectedAgentId,
  currentNodes,
  saved,
  gridSpacingX = LV_GRID_SPACING_X,
  gridSpacingY = LV_GRID_SPACING_Y,
  gridCols = LV_GRID_COLS,
}: MapAgentsToLiveViewNodesParams): Node[] {
  return agentsList.map((agent, idx) => {
    const existingNode = currentNodes.find(n => n.id === agent.agent_id);
    const isSelected = agent.agent_id === selectedAgentId;
    const savedPos = saved[agent.agent_id];
    const defaultPos = {
      x: gridSpacingX * (idx % gridCols),
      y: gridSpacingY * Math.floor(idx / gridCols),
    };

    return {
      id: agent.agent_id,
      type: agent.node_type || "agentCard",
      selected: isSelected,
      data: {
        label: agent.display_name || agent.agent_id,
        model: agent.model,
        total: agent.total,
        worstCount: agent.worst_count,
        isOfficial: agent.is_official || false,
        isGhost: agent.is_ghost || false,
        driftStatus: agent.drift_status || "official",
        signals: agent.signals,
        blur: !!selectedAgentId && !isSelected,
      },
      position: existingNode?.position || savedPos || defaultPos,
    };
  });
}
