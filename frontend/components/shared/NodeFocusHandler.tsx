"use client";

import type { Node } from "reactflow";
import { useReactFlow } from "reactflow";

import { useGraphCameraController } from "@/lib/react-flow/useGraphCameraController";

interface NodeFocusHandlerProps {
  selectedNodeId: string | null;
  isPanelOpen: boolean;
  nodes: Node[];
  fitRequestVersion?: number;
  idleFitRequestVersion?: number;
}

export const NodeFocusHandler: React.FC<NodeFocusHandlerProps> = ({
  selectedNodeId,
  isPanelOpen,
  nodes,
  fitRequestVersion = 0,
  idleFitRequestVersion = 0,
}) => {
  const { setCenter, fitView } = useReactFlow();

  useGraphCameraController({
    nodes,
    selectedNodeId,
    fitView,
    setCenter,
    fitRequestVersion,
    idleFitRequestVersion,
    fitDurationMs: 800,
    fitPadding: 0.2,
    focusZoom: 1.6,
    focusDurationMs: 800,
    focusOffsetX: isPanelOpen ? 240 : 0,
  });

  return null;
};
