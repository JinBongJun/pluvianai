'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export type AgentCardNodeData = {
  label: string;
  model?: string;
};

export const AgentCardNode = memo(({ data, selected }: NodeProps<AgentCardNodeData>) => {
  const { label, model } = data;

  return (
    <div className="group relative">
      {/* Target/Source handles - Styled as IN/OUT dots from screenshot */}
      <div className="absolute left-[-5px] top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-[#8b5cf6] !border-none !shadow-[0_0_8px_rgba(139,92,246,0.4)]"
        />
        <span className="text-[7px] font-black text-[#8b5cf6]/50 uppercase tracking-tighter pointer-events-none">IN</span>
      </div>

      <div className="absolute right-[-5px] top-1/2 -translate-y-1/2 flex items-center gap-1.5 z-10">
        <span className="text-[7px] font-black text-[#8b5cf6]/50 uppercase tracking-tighter pointer-events-none">OUT</span>
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-[#8b5cf6] !border-none !shadow-[0_0_8px_rgba(139,92,246,0.4)]"
        />
      </div>

      <motion.div
        animate={{
          borderColor: selected ? 'rgba(139, 92, 246, 0.5)' : 'rgba(255, 255, 255, 0.08)',
          backgroundColor: selected ? 'rgba(18, 18, 20, 1)' : 'rgba(18, 18, 20, 0.95)',
        }}
        className={clsx(
          'w-[240px] rounded-lg border backdrop-blur-md overflow-hidden transition-all duration-300',
          selected ? 'shadow-[0_0_50px_rgba(0,0,0,0.8)]' : 'shadow-2xl'
        )}
      >
        {/* Node Header */}
        <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 bg-white/[0.01]">
          <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]/60 shadow-[0_0_5px_rgba(139,92,246,0.5)]" />
          <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] opacity-60">Agent Box</span>
        </div>

        <div className="p-6 flex flex-col gap-1.5">
          <h3 className="text-base font-bold text-white tracking-tight truncate leading-none">{label}</h3>
          <p className="text-[11px] text-slate-500 font-medium truncate font-mono opacity-40">{model || 'gpt-4o'}</p>
        </div>
      </motion.div>
    </div>
  );
});

AgentCardNode.displayName = 'AgentCardNode';
