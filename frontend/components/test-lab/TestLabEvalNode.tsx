'use client';

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps, Connection, useReactFlow } from 'reactflow';
import { Scale, CheckCircle2, XCircle, AlertCircle, BarChart3, ChevronRight, Circle, Trash2 } from 'lucide-react';
import { checkClinicalConnection } from '@/lib/clinical-validation';
import clsx from 'clsx';

export type TestLabEvalNodeData = {
    label: string;
    metrics?: {
        accuracy?: number;
        hallucination?: number;
        tone?: number;
    };
    status?: 'pending' | 'evaluating' | 'passed' | 'failed' | 'warning';
    signals?: {
        name: string;
        passed: boolean;
        score: number;
    }[];
    onEdit?: () => void;
    onDelete?: () => void;
};

export const TestLabEvalNode: React.FC<NodeProps<TestLabEvalNodeData>> = ({ id, data, selected }) => {
    const {
        label,
        status = 'pending',
        onEdit,
        onDelete,
    } = data;
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: Connection) => {
        return checkClinicalConnection(
            connection,
            getNode(connection.source || ''),
            getNode(connection.target || '')
        );
    }, [getNode]);

    const statusColors = {
        pending: 'border-slate-700 bg-slate-500/5',
        evaluating: 'border-cyan-500 animate-pulse bg-cyan-500/10',
        passed: 'border-emerald-500 bg-emerald-500/10',
        failed: 'border-red-500 bg-red-500/10',
        warning: 'border-amber-500 bg-amber-500/10'
    };

    return (
        <div className="relative group">
            {/* Hover Header - Name & Delete */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-50">
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                    className="px-3 py-1.5 rounded-xl bg-[#0a0a0c]/90 border border-cyan-500/30 backdrop-blur-xl shadow-2xl flex items-center gap-2 hover:bg-cyan-500/10 transition-all"
                >
                    <BarChart3 className="w-3 h-3 text-cyan-500" />
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap">{label || 'EVALUATOR'}</span>
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                    className="p-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-all"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            <div
                className={clsx(
                    "relative flex items-center gap-6 px-8 py-4 rounded-full border-2 transition-all bg-[#0a0a0c]/90 backdrop-blur-2xl group/core",
                    selected
                        ? "border-cyan-400 shadow-[0_0_40px_rgba(34,211,238,0.4)] bg-[#1a1a1e]"
                        : statusColors[status]
                )}
            >
                {/* Analytic Core - Minimalist */}
                <div className="relative">
                    <div className="absolute inset-0 scale-150 bg-cyan-500/10 blur-xl rounded-full" />
                    <div className="relative w-10 h-10 rounded-full bg-[#0a0a0c] border border-cyan-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                        <BarChart3 className="w-5 h-5 text-cyan-500" />
                    </div>
                </div>

                <div className="flex flex-col">
                    <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 w-fit mb-1">
                        <span className="text-[7px] font-black text-cyan-500 uppercase tracking-widest">Neural Evaluator</span>
                    </div>
                    <span className="text-base font-black text-white tracking-[0.2em] uppercase italic whitespace-nowrap">{label || 'Analysis Unit'}</span>
                </div>

                {/* Input Handle (Left) */}
                <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex items-center group/ingress">
                    <span className="absolute right-12 text-[7px] font-black text-cyan-500 tracking-wider opacity-0 group-hover/ingress:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-cyan-500/20 pointer-events-none">Specimen Target</span>
                    <Handle
                        type="target"
                        position={Position.Left}
                        id="specimen-target"
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-cyan-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(34,211,238,0.5)] !flex items-center justify-center pointer-events-auto transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-cyan-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-cyan-500/40"
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
                    </Handle>
                </div>

                {/* Scoring Output (Right) - Integrated Signal Point */}
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center group/bay">
                    {/* Signal Bridge - Static */}
                    <div className="absolute -left-10 w-10 h-16 pointer-events-none">
                        <svg width="100%" height="100%" viewBox="0 0 40 64">
                            <circle r="1.5" fill="#22d3ee" opacity="0.2" cx="20" cy="32" />
                        </svg>
                    </div>

                    <span className="absolute left-10 text-[7px] font-black text-cyan-500 tracking-[0.2em] uppercase opacity-0 group-hover/bay:opacity-100 transition-all bg-black/80 px-2 py-1 rounded border border-cyan-500/20 whitespace-nowrap">SCORING FEED</span>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="scoring-feed"
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-cyan-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(34,211,238,0.5)] !flex items-center justify-center pointer-events-auto transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-cyan-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-cyan-500/40"
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

export default TestLabEvalNode;
