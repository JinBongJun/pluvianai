'use client';

import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { UserCheck, Check, X } from 'lucide-react';

export type TestLabApprovalNodeData = {
    label: string;
    onApprove?: () => void;
    onReject?: () => void;
};

export const TestLabApprovalNode: React.FC<NodeProps<TestLabApprovalNodeData>> = ({ data, selected }) => {
    return (
        <div
            className={`
                relative min-w-[200px] bg-[#1a1a1e]/90 backdrop-blur-xl rounded-2xl border-2 transition-all p-4 group
                ${selected ? 'border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'border-blue-500/20'}
            `}
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 mb-1">
                    <UserCheck className="w-4 h-4 text-blue-400" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Approval Gate</span>
                </div>

                <span className="text-sm font-bold text-white tracking-tight">{data.label || 'Pending Review'}</span>

                <div className="flex items-center gap-2 mt-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); data.onApprove?.(); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/30 transition-all"
                    >
                        <Check className="w-3 h-3" />
                        APPROVE
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); data.onReject?.(); }}
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] font-bold hover:bg-red-500/30 transition-all"
                    >
                        <X className="w-3 h-3" />
                        REJECT
                    </button>
                </div>
            </div>

            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-blue-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(59,130,246,0.5)]"
            />
            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(16,185,129,0.5)]"
            />
        </div>
    );
};

export default TestLabApprovalNode;
