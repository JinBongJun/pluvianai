// Shared components - DrawIOStepEdge
import React from "react";
import { EdgeProps, getSmoothStepPath } from "reactflow";

const DrawIOStepEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path stroke-2 stroke-emerald-500/50"
      d={edgePath}
      markerEnd={markerEnd}
    />
  );
};

export default DrawIOStepEdge;
