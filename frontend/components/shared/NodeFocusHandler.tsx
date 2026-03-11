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
       * The inspector (RailwaySidePanel) is 1100px wide with a 24px (right-6) margin. Total = 1124px.
       * To center the node in the remaining workspace, we need to shift the camera focus point
       * to the RIGHT by (TotalPanelWidth / 2) in screen pixels.
       *
       * Since ReactFlow's setCenter uses graph coordinates, we must divide the pixel offset by the zoom level.
       * Graph Offset = (1124 / 2) / 1.6 = 351.25 units.
       */
      const xOffset = isPanelOpen ? 351.25 : 0;

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
