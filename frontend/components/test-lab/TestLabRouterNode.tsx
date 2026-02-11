'use client';

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';

export type TestLabRouterNodeData = {
    label: string;
};

export const TestLabRouterNode: React.FC<NodeProps<TestLabRouterNodeData>> = ({ data, selected }) => {
    return (
        <div className="relative group">
            {/* Diamond Shape using CSS Transform */}
            <div
                className={`
                    w-12 h-12 rotate-45 border-2 transition-all backdrop-blur-xl
                    ${selected ? 'border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.6)] bg-[#1a1a1e]' : 'border-amber-500/30 bg-amber-500/5'}
                `}
            >
                {/* Visual Icon - Rotated back to normal */}
                <div className="-rotate-45 w-full h-full flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-amber-500" />
                </div>
            </div>

            {/* Labels */}
            <div className="absolute top-14 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">{data.label || 'ROUTER'}</span>
            </div>

            {/* Handles - Positioned at diamond tips */}
            <Handle
                type="target"
                position={Position.Top}
                className="!w-2 !h-2 !bg-amber-500 !border-0 !opacity-0" // Input tip (Top tip of diamond)
            />
            {/* Actual Functional Handles */}
            <Handle
                type="target"
                position={Position.Left}
                id="in"
                className="!w-2 !h-2 !bg-amber-500 !border-none shadow-[0_0_8px_rgba(245,158,11,0.5)] !left-0 !top-1/2"
            />

            <Handle
                type="source"
                position={Position.Right}
                id="out-default"
                className="!w-2 !h-2 !bg-amber-500 !border-none shadow-[0_0_8px_rgba(245,158,11,0.5)] !right-0 !top-1/2"
            />

            <Handle
                type="source"
                position={Position.Bottom}
                id="out-loop"
                className="!w-2 !h-2 !bg-red-500 !border-none shadow-[0_0_8px_rgba(239,68,68,0.5)] !bottom-0 !left-1/2"
            />
        </div>
    );
};

export default TestLabRouterNode;
