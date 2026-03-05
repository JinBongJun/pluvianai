"use client";

import React from "react";
import { EdgeProps, getBezierPath } from "reactflow";
import { motion } from "framer-motion";

const DrawIOEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // Velocity logic based on data (simulated for now)
  // latency 500ms -> duration 2s
  // latency 2000ms -> duration 5s
  const duration = data?.latency ? Math.max(1, data.latency / 400) : 3;

  return (
    <g className="react-flow__edge">
      {/* Layer 1: Structural Base (Glassy Foundation) */}
      <path
        id={id}
        style={style}
        className="react-flow__edge-path stroke-[3] stroke-white/5 fill-none"
        d={edgePath}
      />

      {/* Layer 2: Atmospheric Aura (Soft Glow) */}
      <path
        className="react-flow__edge-path stroke-[1.5] stroke-emerald-500/20 fill-none"
        d={edgePath}
      />

      {/* Layer 3: Kinetic Particle Flow (Data Transmission) */}
      <motion.path
        id={`${id}-particles`}
        className="react-flow__edge-path stroke-emerald-400 fill-none stroke-[1.5]"
        d={edgePath}
        initial={{ strokeDasharray: "4, 12", strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -100 }}
        transition={{
          duration: duration,
          repeat: Infinity,
          ease: "linear",
        }}
        markerEnd={markerEnd}
        style={{
          filter: "drop-shadow(0 0 3px rgba(52, 211, 153, 0.5))",
        }}
      />
    </g>
  );
};

export default DrawIOEdge;
