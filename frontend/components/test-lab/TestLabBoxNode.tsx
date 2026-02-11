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
                relative min-w-[220px] rounded-lg border-2 transition-all p-0 group
                ${selected ? 'border-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.5)] bg-[#1a1a1e]' : statusColors[status]}
                ${!selected && statusBgColors[status]}
                backdrop-blur-xl
            `}
        >
            {/* Input Handle (Left) - Emerald Logic */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex items-center">
                <span className="absolute right-4 text-[7px] font-black text-emerald-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">IN</span>
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-transform hover:scale-125"
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                    <div className={clsx("p-1.5 rounded-md", status === 'running' ? "bg-violet-500/20 text-violet-400" : "bg-white/5 text-slate-400")}>
                        <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white tracking-tight leading-none mb-0.5">{label}</span>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{model}</span>
                    </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="p-1.5 rounded hover:bg-violet-500/20 text-slate-500 hover:text-violet-400 transition-colors"
                        >
                            <Edit className="w-3 h-3" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content (Clinical Data) */}
            <div className="p-3 space-y-2">

                {/* Status Indicator */}
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Status</span>
                    {status === 'running' && (
                        <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                            </span>
                            <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Active</span>
                        </div>
                    )}
                    {status === 'idle' && <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Standby</span>}
                    {status === 'completed' && <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Stable</span>}
                    {status === 'error' && <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Failure</span>}
                </div>

                {/* Metrics Placeholder (Micro-Charts) */}
                <div className="grid grid-cols-2 gap-1 pt-1">
                    <div className="bg-white/[0.02] rounded px-2 py-1.5 border border-white/5">
                        <div className="text-[9px] text-slate-500 mb-0.5">Latency</div>
                        <div className="text-[10px] font-mono text-slate-300">24ms</div>
                    </div>
                    <div className="bg-white/[0.02] rounded px-2 py-1.5 border border-white/5">
                        <div className="text-[9px] text-slate-500 mb-0.5">Tokens</div>
                        <div className="text-[10px] font-mono text-slate-300">1.2k</div>
                    </div>
                </div>
            </div>

            {/* Output Handle (Right) - Violet Logic */}
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
