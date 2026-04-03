"use client";

import { useReactFlow } from "reactflow";

import { useSelectedNodeCenter } from "@/lib/react-flow/useSelectedNodeCenter";

interface NodeFocusHandlerProps {
  selectedNodeId: string | null;
  isPanelOpen: boolean;
}

export const NodeFocusHandler: React.FC<NodeFocusHandlerProps> = ({
  selectedNodeId,
  isPanelOpen,
}) => {
  const { setCenter, getNodes } = useReactFlow();
  const nodes = getNodes();

  useSelectedNodeCenter({
    selectedNodeId,
    nodes,
    setCenter,
    zoom: 1.6,
    durationMs: 800,
    offsetX: isPanelOpen ? 240 : 0,
  });

  return null;
};
