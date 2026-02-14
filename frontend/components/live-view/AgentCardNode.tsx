'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { ChevronRight } from 'lucide-react';
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
      <motion.div
        animate={{
          borderColor: selected ? '#8b5cf6' : 'rgba(139, 92, 246, 0.2)',
          backgroundColor: selected ? 'rgba(18, 18, 20, 1)' : 'rgba(10, 10, 12, 0.95)',
        }}
        className={clsx(
          'w-[260px] rounded-[32px] border-2 backdrop-blur-2xl overflow-hidden transition-all duration-300 p-6 flex flex-col items-center text-center gap-4 group/core',
          selected ? 'shadow-[0_0_50px_rgba(139,92,246,0.3)]' : 'shadow-2xl'
        )}
      >
        {/* Clinical Processing Core - Violet */}
        <div className="relative">
          <div className="absolute inset-0 scale-150 bg-purple-500/10 blur-xl rounded-full" />
          <div className="relative w-12 h-12 rounded-full bg-[#0a0a0c] border border-purple-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.2)]">
            <div className="w-2 h-2 rounded-full border-2 border-[#8b5cf6]" />
          </div>
        </div>

        <div className="space-y-1.5 w-full">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 w-fit mx-auto">
            <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">Cognitive Unit</span>
          </div>
          <h3 className="text-lg font-black text-white tracking-tight truncate leading-none uppercase italic">{label}</h3>
          <p className="text-[10px] text-slate-500 font-bold truncate font-mono opacity-60 bg-white/5 py-1 px-3 rounded-full border border-white/5 uppercase tracking-wider">{model || 'neural-engine-v1'}</p>
        </div>

        {/* Input/Output Points - Unified & Filled Donut / Arrow */}
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex flex-col gap-6 items-center">
          {/* Main Ingress */}
          <div className="relative group/ingress">
            <span className="absolute right-12 text-[7px] font-black text-purple-400 tracking-wider opacity-0 group-hover/ingress:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-purple-500/20 pointer-events-none">Signal Ingress</span>
            <Handle
              type="target"
              position={Position.Left}
              id="agent-ingress"
              className="!w-8 !h-8 !bg-purple-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(139,92,246,0.5)] !flex items-center justify-center !relative !left-0 !top-0 !translate-y-0 transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-purple-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-purple-500/40"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
            </Handle>
          </div>
          {/* Alt Ingress (Cyan) */}
          <div className="relative group/ingress-alt">
            <span className="absolute right-12 text-[7px] font-black text-cyan-400 tracking-wider opacity-0 group-hover/ingress-alt:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-cyan-500/20 pointer-events-none">Context Link</span>
            <Handle
              type="target"
              position={Position.Left}
              id="agent-context"
              className="!w-8 !h-8 !bg-cyan-400 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(34,211,238,0.5)] !flex items-center justify-center !relative !left-0 !top-0 !translate-y-0 transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-cyan-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-cyan-500/40"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
            </Handle>
          </div>
        </div>

        <div className="absolute -right-4 top-1/2 -translate-y-1/2 flex flex-col gap-6 items-center">
          {/* Main Egress */}
          <div className="relative group/egress">
            <span className="absolute left-12 text-[7px] font-black text-purple-400 tracking-wider opacity-0 group-hover/egress:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-purple-500/20 pointer-events-none">Decision Egress</span>
            <Handle
              type="source"
              position={Position.Right}
              id="agent-egress"
              className="!w-8 !h-8 !bg-purple-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(139,92,246,0.5)] !flex items-center justify-center !relative !right-0 !top-0 !translate-y-0 transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-purple-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-purple-500/40"
            >
              <div className="w-full h-full flex items-center justify-center pointer-events-none">
                <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
              </div>
            </Handle>
          </div>
          {/* Alt Egress */}
          <div className="relative group/egress-alt">
            <span className="absolute left-12 text-[7px] font-black text-purple-400 tracking-wider opacity-0 group-hover/egress-alt:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-purple-500/20 pointer-events-none">Aux Egress</span>
            <Handle
              type="source"
              position={Position.Right}
              id="agent-aux"
              className="!w-8 !h-8 !bg-purple-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(139,92,246,0.5)] !flex items-center justify-center !relative !right-0 !top-0 !translate-y-0 transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-purple-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-purple-500/40"
            >
              <div className="w-full h-full flex items-center justify-center pointer-events-none">
                <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
              </div>
            </Handle>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

AgentCardNode.displayName = 'AgentCardNode';
