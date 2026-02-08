'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Bot, Zap } from 'lucide-react';
import { clsx } from 'clsx';

export type AgentCardNodeData = {
  label: string;
  subtitle?: string;
  model?: string;
  total?: number;
  worstCount?: number;
  agentId?: string;
};

function AgentCardNodeComponent({ data, selected }: NodeProps<AgentCardNodeData>) {
  const displayName = data.label || 'Agent';
  const subtitle = data.subtitle || data.model || data.agentId || '';
  const total = data.total ?? 0;

  return (
    <>
      {/* Draw.io style: 4-directional connection handles (visible on hover) - small blue squares */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-4 !h-4 !border-2 !border-blue-400 !bg-blue-500/30 !rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
        id="top"
        style={{ top: -8, pointerEvents: 'auto' }}
      />
      <Handle
        type="target"
        position={Position.Right}
        className="!w-4 !h-4 !border-2 !border-blue-400 !bg-blue-500/30 !rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
        id="right"
        style={{ right: -8, pointerEvents: 'auto' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !border-2 !border-blue-400 !bg-blue-500/30 !rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
        id="bottom"
        style={{ bottom: -8, pointerEvents: 'auto' }}
      />
      <Handle
        type="source"
        position={Position.Left}
        className="!w-4 !h-4 !border-2 !border-blue-400 !bg-blue-500/30 !rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
        id="left"
        style={{ left: -8, pointerEvents: 'auto' }}
      />
      <div
        className={clsx(
          'min-w-[200px] rounded-xl border bg-[#1e1e24] shadow-lg transition-all group',
          selected
            ? 'border-violet-500/80 shadow-[0_0_20px_rgba(124,58,237,0.25)]'
            : 'border-white/10 group-hover:border-blue-400 group-hover:border-dashed',
        )}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-violet-600/30 border border-violet-500/40 flex items-center justify-center">
              <Bot className="h-5 w-5 text-violet-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-white truncate">{displayName}</div>
              {subtitle && (
                <div className="text-xs text-slate-400 truncate mt-0.5">{subtitle}</div>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
                  Online
                </span>
                {total > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <Zap className="h-3 w-3" />
                    {total} calls
                  </span>
                )}
                {(data.worstCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs text-red-400 font-medium">
                    {data.worstCount} worst
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const AgentCardNode = memo(AgentCardNodeComponent);
