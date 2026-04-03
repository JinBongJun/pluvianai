import type { Node } from "reactflow";

import type { AgentForPicker } from "./AgentPickerCard";

export const RG_GRID_SPACING_X = 300;
export const RG_GRID_SPACING_Y = 200;
export const RG_GRID_COLS = 3;

export type ReleaseGateMapAgentRow = AgentForPicker & {
  total?: number;
  is_official?: boolean;
  drift_status?: string;
  signals?: unknown;
};

export type MapAgentsToReleaseGateNodesParams = {
  agents: ReleaseGateMapAgentRow[];
  selectedNodeId: string | null;
  currentNodes: Node[];
  saved: Record<string, { x: number; y: number }>;
  gridSpacingX?: number;
  gridSpacingY?: number;
  gridCols?: number;
};

function isNearOccupiedPosition(
  position: { x: number; y: number },
  occupiedPositions: Array<{ x: number; y: number }>,
  gridSpacingX: number,
  gridSpacingY: number
): boolean {
  const collisionThresholdX = Math.max(80, Math.floor(gridSpacingX * 0.6));
  const collisionThresholdY = Math.max(80, Math.floor(gridSpacingY * 0.6));
  return occupiedPositions.some(
    occupied =>
      Math.abs(occupied.x - position.x) < collisionThresholdX &&
      Math.abs(occupied.y - position.y) < collisionThresholdY
  );
}

function findNextOpenGridPosition(options: {
  occupiedPositions: Array<{ x: number; y: number }>;
  startIndex: number;
  gridSpacingX: number;
  gridSpacingY: number;
  gridCols: number;
}): { x: number; y: number } {
  const { occupiedPositions, startIndex, gridSpacingX, gridSpacingY, gridCols } = options;
  for (let slotIndex = Math.max(0, startIndex); slotIndex < startIndex + 500; slotIndex += 1) {
    const candidate = {
      x: gridSpacingX * (slotIndex % gridCols),
      y: gridSpacingY * Math.floor(slotIndex / gridCols),
    };
    if (!isNearOccupiedPosition(candidate, occupiedPositions, gridSpacingX, gridSpacingY)) {
      return candidate;
    }
  }
  return {
    x: gridSpacingX * ((startIndex + occupiedPositions.length) % gridCols),
    y: gridSpacingY * Math.floor((startIndex + occupiedPositions.length) / gridCols),
  };
}

export function mapAgentsToReleaseGateNodes({
  agents,
  selectedNodeId,
  currentNodes,
  saved,
  gridSpacingX = RG_GRID_SPACING_X,
  gridSpacingY = RG_GRID_SPACING_Y,
  gridCols = RG_GRID_COLS,
}: MapAgentsToReleaseGateNodesParams): Node[] {
  const currentNodeById = new Map(currentNodes.map(node => [node.id, node]));
  const occupiedPositions: Array<{ x: number; y: number }> = [];

  for (const agent of agents) {
    const existingNode = currentNodeById.get(agent.agent_id);
    if (existingNode?.position) {
      occupiedPositions.push(existingNode.position);
      continue;
    }
    const savedPos = saved[agent.agent_id];
    if (savedPos) {
      occupiedPositions.push(savedPos);
    }
  }

  return agents.map((agent, idx) => {
    const existingNode = currentNodeById.get(agent.agent_id);
    const isSelected = agent.agent_id === selectedNodeId;
    const savedPos = saved[agent.agent_id];
    const position =
      existingNode?.position ||
      savedPos ||
      findNextOpenGridPosition({
        occupiedPositions,
        startIndex: idx,
        gridSpacingX,
        gridSpacingY,
        gridCols,
      });

    if (!existingNode?.position && !savedPos) {
      occupiedPositions.push(position);
    }

    return {
      id: agent.agent_id,
      type: "agentCard",
      data: {
        label: agent.display_name || agent.agent_id,
        model: agent.model,
        total: agent.total,
        worstCount: agent.worst_count,
        isOfficial: agent.is_official || false,
        isGhost: agent.is_ghost || false,
        driftStatus: agent.drift_status || "official",
        signals: agent.signals,
        theme: "releaseGate",
        blur: !!selectedNodeId && !isSelected,
      },
      position,
      selected: isSelected,
    };
  });
}
