import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Bot, Edit, Trash2, Settings } from 'lucide-react';
import clsx from 'clsx';

export type TestLabBoxNodeData = {
    label: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    inputCount?: number;
    onEdit?: () => void;
    onDelete?: () => void;
    status?: 'idle' | 'running' | 'completed' | 'error';
};

export const TestLabBoxNode: React.FC<NodeProps<TestLabBoxNodeData>> = ({ data, selected }) => {
    const { label, model = 'gpt-4o', onEdit, onDelete, status = 'idle' } = data;

    const statusColors = {
        idle: 'border-violet-500/30',
        running: 'border-violet-500 shadow-lg shadow-violet-500/20',
        completed: 'border-violet-400',
        error: 'border-red-500',
    };

    const statusBgColors = {
        idle: 'bg-violet-500/5',
        running: 'bg-violet-500/10',
        completed: 'bg-violet-400/10',
        error: 'bg-red-500/10',
    };

    return (
        <div
            className={`
                relative min-w-[280px] rounded-xl border-2 transition-all p-0 group
                ${selected ? 'border-violet-400 shadow-[0_0_25px_rgba(139,92,246,0.6)] bg-[#1a1a1e]' : statusColors[status]}
                ${!selected && statusBgColors[status]}
                backdrop-blur-xl
            `}
        >
            {/* Main Input Handle (Left) - Emerald Logic */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex items-center">
                <span className="absolute right-4 text-[7px] font-black text-emerald-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">IN</span>
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-transform hover:scale-125"
                />
            </div>

            {/* Helper Response Handle (Bottom-Left) - Cyan Logic */}
            <div className="absolute left-8 -bottom-1.5 flex items-center">
                <span className="absolute -top-4 text-[7px] font-black text-cyan-400 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">HELPER_RES</span>
                <Handle
                    type="target"
                    id="helper-response"
                    position={Position.Bottom}
                    className="!w-2.5 !h-2.5 !bg-cyan-400 !border-2 !border-[#0a0a0c] shadow-[0_0_8px_rgba(34,211,238,0.5)] transition-transform hover:scale-125"
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Agent Box</span>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onEdit && (
                        <button onClick={onEdit} className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                            <Edit className="w-3 h-3" />
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={onDelete} className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-red-400 transition-colors">
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Identity Area */}
            <div className="p-4 pt-3">
                <div className="flex flex-col">
                    <span className="text-lg font-bold text-white tracking-tight mb-0.5">{label}</span>
                    <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{model}</span>
                </div>
            </div>

            {/* Helper Request Handle (Bottom-Right) - Purple Logic */}
            <div className="absolute right-8 -bottom-1.5 flex items-center">
                <span className="absolute -top-4 text-[7px] font-black text-violet-400 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">HELPER_REQ</span>
                <Handle
                    type="source"
                    id="helper-request"
                    position={Position.Bottom}
                    className="!w-2.5 !h-2.5 !bg-violet-400 !border-2 !border-[#0a0a0c] shadow-[0_0_8px_rgba(167,139,250,0.5)] transition-transform hover:scale-125"
                />
            </div>

            {/* Main Output Handle (Right) - Violet Logic */}
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-end">
                <span className="absolute left-4 text-[7px] font-black text-violet-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">OUT</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-violet-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(139,92,246,0.5)] transition-transform hover:scale-125"
                />
            </div>
        </div>
    );
};

export default TestLabBoxNode;
