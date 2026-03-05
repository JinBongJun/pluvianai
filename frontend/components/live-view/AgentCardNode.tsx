"use client";

import React, { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import clsx from "clsx";
import { motion } from "framer-motion";

export type AgentCardNodeData = {
  label: string;
  model?: string;
  isOfficial?: boolean;
  isGhost?: boolean;
  driftStatus?: "official" | "ghost" | "zombie";
  signals?: Record<string, number>;
  total?: number;
  worstCount?: number;
};


export const AgentCardNode = memo(({ id, data, selected }: NodeProps<AgentCardNodeData>) => {
  const { label, model } = data;
  const isCritical = (data.worstCount || 0) > 0;


  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: selected ? 1.02 : 1 }}
      className={clsx(
        "w-[300px] rounded-xl border transition-all duration-300 relative cursor-pointer group shadow-md",
        selected
          ? "bg-[#1f2b3b] border-emerald-500/40 ring-1 ring-emerald-500/20 z-20"
          : "bg-[#131d2b] border-white/5 hover:border-emerald-500/20 hover:bg-[#182230]",
        isCritical && !selected && "border-rose-500/30 bg-[#241217]"
      )}
    >
      <div className="p-4 flex flex-col relative z-10 w-full min-h-[90px]">
        {/* Header: Icon + Title */}
        <div className="flex items-start gap-3 mb-4">
          {/* Logo Badge (Railway Style) */}
          <div
            className={clsx(
              "w-[38px] h-[38px] rounded-lg border flex items-center justify-center shrink-0 shadow-inner bg-[#1a2432] group-hover:bg-[#202a3a] transition-colors",
              isCritical ? "border-rose-500/30" : "border-white/5 group-hover:border-emerald-500/20"
            )}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={clsx("opacity-90", isCritical ? "text-rose-400" : "text-emerald-400")}
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-[15px] font-semibold text-white tracking-tight truncate group-hover:text-emerald-100 transition-colors">
              {label}
            </h3>
            <p className="text-[13px] text-slate-400 truncate mt-0.5 font-mono opacity-80 group-hover:text-slate-300 transition-colors">
              {model || "agent-production-env"}
            </p>
          </div>
        </div>

        {/* Footer: Status + Telemetry */}
        <div className="flex items-center justify-between mt-auto">
          {/* Status */}
          <div className="flex items-center gap-2">
            <div
              className={clsx(
                "w-2 h-2 rounded-full",
                isCritical
                  ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                  : data.isGhost
                    ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                    : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
              )}
            />
            <span
              className={clsx(
                "text-[12px] font-medium tracking-wide",
                isCritical ? "text-rose-400" : data.isGhost ? "text-amber-400" : "text-emerald-400"
              )}
            >
              {isCritical ? "Critical" : data.isGhost ? "Ghost" : "Online"}
            </span>
          </div>
        </div>
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

AgentCardNode.displayName = "AgentCardNode";
