"use client";

import { useEffect } from "react";
import { useReactFlow, useOnSelectionChange, Node } from "reactflow";

interface NodeFocusHandlerProps {
  selectedNodeId: string | null;
  isPanelOpen: boolean;
}

export const NodeFocusHandler: React.FC<NodeFocusHandlerProps> = ({
  selectedNodeId,
  isPanelOpen,
}) => {
  const { setCenter, getNodes, getZoom } = useReactFlow();

  useEffect(() => {
    if (!selectedNodeId) return;

    const node = getNodes().find(n => n.id === selectedNodeId);
    if (node) {
      // High-fidelity clinical zoom (1.6x for maximum specimen visibility)
      const targetZoom = 1.6;

      /**
       * CALCULATION LOGIC:
       * The right panel is ~500px wide. The remaining canvas width is roughly viewport - 500px.
       * We shift the camera LEFT by half the panel width so the node sits centered
       * in the visible canvas area (left side).
       *
       * Panel screen offset ≈ 500px → shift LEFT by 500/2 = 250px screen pixels.
       * Since ReactFlow's setCenter uses graph coordinates, divide by zoom: 250 / 1.6 ≈ 156 units.
       * A small additional nudge (+20) ensures the node is fully visible.
       */
      const xOffset = isPanelOpen ? 240 : 0;

      // Fallback dimensions if node hasn't been measured yet (AgentCardNode is 340px wide)
      const nWidth = node.width ?? 340;
      const nHeight = node.height ?? 200;

      setCenter(node.position.x + nWidth / 2 + xOffset, node.position.y + nHeight / 2, {
        zoom: targetZoom,
        duration: 800,
      });
    }
  }, [selectedNodeId, isPanelOpen, getNodes, setCenter, getZoom]);

  return null;
};
