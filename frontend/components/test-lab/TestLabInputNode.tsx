'use client';

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps, Connection, useReactFlow } from 'reactflow';
import { Play, ChevronRight, Trash2, Database } from 'lucide-react';
import { checkClinicalConnection } from '@/lib/clinical-validation';
import clsx from 'clsx';

export type TestLabInputNodeData = {
    label: string;
    textInput: string;
    onTextChange: (text: string) => void;
    attachments: File[];
    onAttachmentsChange: (files: File[]) => void;
    worstExamples: string[];
    onWorstExamplesChange: (examples: string[]) => void;
    goldenExamples: string[];
    onGoldenExamplesChange: (examples: string[]) => void;
    inputType?: 'text' | 'multimodal';
    onEdit?: () => void;
    onDelete?: () => void;
};

export const TestLabInputNode: React.FC<NodeProps<TestLabInputNodeData>> = ({ id, data, selected }) => {
    const { label, onEdit, onDelete } = data;
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: Connection) => {
        return checkClinicalConnection(
            connection,
            getNode(connection.source || ''),
            getNode(connection.target || '')
        );
    }, [getNode]);

    return (
        <div className="relative group">
            {/* Hover Header - Name & Delete */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-50">
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                    className="px-3 py-1.5 rounded-xl bg-[#0a0a0c]/90 border border-emerald-500/30 backdrop-blur-xl shadow-2xl flex items-center gap-2 hover:bg-emerald-500/10 transition-all"
                >
                    <Play className="w-3 h-3 text-emerald-500" />
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap">{label || 'START'}</span>
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
                        ? "border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.5)] bg-[#1a1a1e]"
                        : "border-emerald-500/30 hover:border-emerald-500/50 bg-[#0a0a0c]/95"
                )}
            >
                {/* Source Core - Minimalist */}
                <div className="relative">
                    <div className="absolute inset-0 scale-150 bg-emerald-500/10 blur-xl rounded-full" />
                    <div className="relative w-10 h-10 rounded-full bg-[#0a0a0c] border border-emerald-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                        <Play className="w-5 h-5 fill-emerald-500 text-emerald-500" />
                    </div>
                </div>

                <div className="flex flex-col">
                    <div className="flex items-center gap-2 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 w-fit mb-1">
                        <span className="text-[7px] font-black text-emerald-500 uppercase tracking-widest">Payload Source</span>
                    </div>
                    <span className="text-base font-black text-white tracking-[0.2em] uppercase italic whitespace-nowrap">{label || 'Clinical Input'}</span>
                </div>

                {/* Output Handle - Integrated Source Point */}
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-end group/bay">
                    {/* Signal Bridge - Static */}
                    <div className="absolute -left-10 w-10 h-16 pointer-events-none">
                        <svg width="100%" height="100%" viewBox="0 0 40 64">
                            <circle r="1.8" fill="#10b981" opacity="0.2" cx="20" cy="32" />
                        </svg>
                    </div>

                    <span className="absolute left-6 text-[7px] font-black text-emerald-500 tracking-[0.2em] uppercase opacity-0 group-hover/bay:opacity-100 transition-all bg-black/80 px-2 py-1 rounded border border-emerald-500/20 whitespace-nowrap">INJECT PAYLOAD</span>
                    <Handle
                        type="source"
                        position={Position.Right}
                        id="start-egress"
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-emerald-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(16,185,129,0.5)] !flex items-center justify-center pointer-events-auto transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-emerald-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-emerald-500/40"
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

export default TestLabInputNode;
