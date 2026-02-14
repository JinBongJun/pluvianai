'use client';

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps, Connection, useReactFlow } from 'reactflow';
import { Bot, Trash2, ChevronRight } from 'lucide-react';
import { checkClinicalConnection } from '@/lib/clinical-validation';
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

export const TestLabBoxNode: React.FC<NodeProps<TestLabBoxNodeData>> = ({ id, data, selected }) => {
    const { label, model = 'gpt-4o', onEdit, onDelete, status = 'idle' } = data as any;
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: Connection) => {
        return checkClinicalConnection(
            connection,
            getNode(connection.source || ''),
            getNode(connection.target || '')
        );
    }, [getNode]);

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

    const statusKey = status as keyof typeof statusColors;

    return (
        <div className="relative group">
            {/* Hover Header - Universal Node UI */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-50">
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                    className="px-3 py-1.5 rounded-xl bg-[#0a0a0c]/90 border border-violet-500/30 backdrop-blur-xl shadow-2xl flex items-center gap-2 hover:bg-violet-500/10 transition-all"
                >
                    <Bot className="w-3 h-3 text-violet-500" />
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap">{label || 'AGENT'}</span>
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                    className="p-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-all"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <div
                className={`
                    relative min-w-[280px] rounded-[32px] border-2 transition-all p-0
                    ${selected ? 'border-violet-400 shadow-[0_0_25px_rgba(139,92,246,0.6)] bg-[#1a1a1e]' : statusColors[statusKey]}
                    ${!selected && statusBgColors[statusKey]}
                    backdrop-blur-xl
                `}
            >
                {/* Main Input Handle (Left) - Logic Ingress */}
                <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex items-center">
                    <span className="absolute right-12 text-[7px] font-black text-violet-500 tracking-wider opacity-0 group-hover:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-violet-500/20 pointer-events-none">Logic Ingress</span>
                    <Handle
                        type="target"
                        id="logic-ingress"
                        position={Position.Left}
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-violet-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all hover:scale-125 !flex items-center justify-center react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-violet-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-violet-500/40"
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
                    </Handle>
                </div>

                {/* Helper Response Handle (Bottom-Left) - Tool Response */}
                <div className="absolute left-10 -bottom-4 flex items-center">
                    <span className="absolute -top-8 text-[7px] font-black text-cyan-400 tracking-wider opacity-0 group-hover:opacity-100 transition-all uppercase text-center w-full whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-cyan-500/20 pointer-events-none">Tool Response</span>
                    <Handle
                        type="target"
                        id="helper-response"
                        position={Position.Bottom}
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-cyan-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-all hover:scale-125 !flex items-center justify-center react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-cyan-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-cyan-500/40"
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
                    </Handle>
                </div>

                {/* Header Sub-label */}
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/[0.02] rounded-t-[30px]">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Agent Box</span>
                    </div>
                </div>

                {/* Identity Area */}
                <div className="p-6 pt-4">
                    <div className="flex flex-col">
                        <span className="text-xl font-black text-white tracking-tighter mb-1 uppercase italic">{label}</span>
                        <div className="flex items-center gap-2">
                            <Bot className="w-3 h-3 text-violet-500/50" />
                            <span className="text-[11px] font-black font-mono text-slate-500 uppercase tracking-widest">{model}</span>
                        </div>
                    </div>
                </div>

                {/* Helper Request Handle (Bottom-Right) - External Call */}
                <div className="absolute right-10 -bottom-4 flex items-center">
                    <span className="absolute -top-8 text-[7px] font-black text-violet-400 tracking-wider opacity-0 group-hover:opacity-100 transition-all uppercase text-center w-full whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-violet-500/20 pointer-events-none">External Call</span>
                    <Handle
                        type="source"
                        id="helper-request"
                        position={Position.Bottom}
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-violet-400 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(167,139,250,0.5)] transition-all hover:scale-125 !flex items-center justify-center react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-violet-400/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-violet-400/40"
                    >
                        <div className="w-full h-full flex items-center justify-center pointer-events-none">
                            <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
                        </div>
                    </Handle>
                </div>

                {/* Main Output Handle (Right) - Relay Result */}
                <div className="absolute -right-4 top-1/2 -translate-y-1/2 flex items-center justify-end">
                    <span className="absolute left-12 text-[7px] font-black text-violet-400 tracking-wider opacity-0 group-hover:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-violet-500/20 pointer-events-none">Relay Result</span>
                    <Handle
                        type="source"
                        id="relay-result"
                        position={Position.Right}
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-violet-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(139,92,246,0.5)] transition-all hover:scale-125 !flex items-center justify-center react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-violet-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-violet-500/40"
                    >
                        <div className="w-full h-full flex items-center justify-center pointer-events-none">
                            <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
                        </div>
                    </Handle>
                </div>
            </div>
        </div>
    );
};

export default TestLabBoxNode;
