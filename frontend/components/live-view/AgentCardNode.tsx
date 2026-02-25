'use client';

import React, { memo, useMemo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import clsx from 'clsx';
import { motion } from 'framer-motion';

export type AgentCardNodeData = {
  label: string;
  model?: string;
  isOfficial?: boolean;
  isGhost?: boolean;
  driftStatus?: 'official' | 'ghost' | 'zombie';
  signals?: Record<string, number>;
  total?: number;
  worstCount?: number;
};

// Procedural EKG Path Generator
// Creates a unique heartbeat path based on a seed (or randomness)
// Must always start at (0, 50) and end at (100, 50) for seamless looping
const generateEKGPath = (isCritical: boolean, seed: number) => {
  // Deterministic random based on seed
  const random = (min: number, max: number) => {
    const x = Math.sin(seed++) * 10000;
    return min + (x - Math.floor(x)) * (max - min);
  };

  const baseline = 50;

  if (isCritical) {
    // Chaotic / Fibrillation / Tachycardia
    // Multiple irregular spikes
    let path = `M0 ${baseline}`;
    let x = 0;
    while (x < 90) {
      x += random(2, 5);
      const y = baseline + random(-35, 35); // High amplitude random noise
      path += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    path += ` L100 ${baseline}`;
    return path;
  } else {
    // Normal Sinus Rhythm (with slight variations)
    // Structure: P wave -> QaS -> T wave
    // Base points for a single beat usually occupy ~40-50% width in this view

    // Beat 1
    const pWaveAmp = random(3, 6);
    const qDepth = random(5, 10);
    const rHeight = random(35, 45); // Main spike
    const sDepth = random(5, 12);
    const tWaveAmp = random(5, 10);

    // Beat spacing (position of the complex in 0-100)
    const startX = random(10, 20);

    // Construct P-QRS-T complex
    return `
      M0 ${baseline} 
      L${startX} ${baseline} 
      L${startX + 5} ${baseline - pWaveAmp} 
      L${startX + 10} ${baseline} 
      L${startX + 15} ${baseline + qDepth} 
      L${startX + 20} ${baseline - rHeight} 
      L${startX + 25} ${baseline + sDepth} 
      L${startX + 30} ${baseline} 
      L${startX + 40} ${baseline - tWaveAmp} 
      L${startX + 50} ${baseline} 
      L100 ${baseline}
    `;
  }
};

export const AgentCardNode = memo(({ id, data, selected }: NodeProps<AgentCardNodeData>) => {
  const { label, model } = data;
  const isCritical = (data.worstCount || 0) > 0;

  // Generate unique path & animation speed for this specific node instance
  // Use ID as seed to ensure stability across renders but uniqueness across nodes
  const { path, duration } = useMemo(() => {
    // Simple hash of ID to number
    const seed = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    return {
      path: generateEKGPath(isCritical, seed),
      // Vary speed slightly: Critical is fast (0.5-0.8s), Normal is slower (3-5s)
      duration: isCritical ? 2 + (seed % 10) / 10 : 3 + (seed % 20) / 10
    };
  }, [id, isCritical]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: selected ? 1.02 : 1 }}
      className={clsx(
        'w-[340px] rounded-xl border transition-all duration-300 relative cursor-pointer group shadow-lg',
        selected
          ? 'bg-[#0f1a24] border-emerald-500/40 ring-1 ring-emerald-500/20 z-20'
          : 'bg-[#0a1118] border-white/5 hover:border-emerald-500/20 hover:bg-[#0c131a]',
        isCritical && !selected && 'border-rose-500/30 bg-[#160a0d]'
      )}
    >
      <div className="p-5 flex flex-col relative z-10 w-full min-h-[140px]">
        {/* Header: Icon + Title */}
        <div className="flex items-start gap-3.5 mb-6">
          {/* Logo Badge (Railway Style) */}
          <div className={clsx(
            "w-[38px] h-[38px] rounded-lg border flex items-center justify-center shrink-0 shadow-inner bg-[#0e1722] group-hover:bg-[#121c2a] transition-colors",
            isCritical ? "border-rose-500/30" : "border-white/5 group-hover:border-emerald-500/20"
          )}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={clsx("opacity-90", isCritical ? "text-rose-400" : "text-emerald-400")}>
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-[15px] font-semibold text-white tracking-tight truncate group-hover:text-emerald-100 transition-colors">
              {label}
            </h3>
            <p className="text-[13px] text-slate-400 truncate mt-0.5 font-mono opacity-80 group-hover:text-slate-300 transition-colors">
              {model || 'agent-production-env'}
            </p>
          </div>
        </div>

        {/* Footer: Status + Telemetry */}
        <div className="flex items-center justify-between mt-auto">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div className={clsx(
              "w-2 h-2 rounded-full",
              isCritical ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]" : data.isGhost ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
            )} />
            <span className={clsx(
              "text-[13px] font-medium tracking-wide",
              isCritical ? "text-rose-400" : data.isGhost ? "text-amber-400" : "text-emerald-400"
            )}>
              {isCritical ? 'Critical' : data.isGhost ? 'Ghost' : 'Online'}
            </span>
          </div>

          {/* Removed Telemetry per request to make graph more prominent */}
        </div>
      </div>

      {/* Prominent Heartbeat Sparkline (Right side of status) */}
      <div className="absolute bottom-5 left-[100px] right-5 h-[35px] pointer-events-none overflow-hidden group-hover:brightness-125 transition-all duration-300">
        <motion.div
          className="absolute top-0 left-0 h-full w-[200%] flex"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: duration, ease: "linear", repeat: Infinity }}
        >
          {[0, 1].map((i) => (
            <div key={i} className="w-1/2 h-full flex items-center">
              <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 -10 100 120">
                <path
                  d={path}
                  stroke={isCritical ? "#f43f5e" : "#10b981"}
                  fill="transparent"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                    filter: isCritical ? 'drop-shadow(0 0 4px rgba(244,63,94,0.6))' : 'drop-shadow(0 0 4px rgba(16,185,129,0.5))'
                  }}
                />
              </svg>
            </div>
          ))}
        </motion.div>
        {/* Soft edge fading so it gracefully emerges from the left */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a1118] via-transparent via-15% to-transparent group-hover:from-[#0c131a] transition-colors" />
      </div>

      {/* Handles (Visually hidden) */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-50 opacity-0 pointer-events-none">
        <Handle type="target" position={Position.Left} />
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-50 opacity-0 pointer-events-none">
        <Handle type="source" position={Position.Right} />
      </div>
    </motion.div>
  );
});

AgentCardNode.displayName = 'AgentCardNode';
