'use client';

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps, Connection, useReactFlow } from 'reactflow';
import { UserCheck, Check, X, ChevronRight, Circle, Trash2 } from 'lucide-react';
import { checkClinicalConnection } from '@/lib/clinical-validation';

export type TestLabApprovalNodeData = {
    label: string;
    onApprove?: () => void;
    onReject?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
};

export const TestLabApprovalNode: React.FC<NodeProps<TestLabApprovalNodeData>> = ({ id, data, selected }) => {
    const { label, onApprove, onReject, onEdit, onDelete } = data;
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
                    className="px-3 py-1.5 rounded-xl bg-[#0a0a0c]/90 border border-blue-500/30 backdrop-blur-xl shadow-2xl flex items-center gap-2 hover:bg-blue-500/10 transition-all font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap"
                >
                    <UserCheck className="w-3 h-3 text-blue-500" />
                    {label || 'APPROVAL'}
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
                    relative min-w-[200px] bg-[#0a0a0c]/90 backdrop-blur-xl rounded-[32px] border-2 transition-all p-6 py-8
                    ${selected ? 'border-blue-400 shadow-[0_0_40px_rgba(59,130,246,0.3)]' : 'border-blue-500/20'}
                    group/core
                `}
            >
                <div className="flex flex-col gap-6 items-center text-center">
                    {/* Pulsing Analytic Core - Minimalist */}
                    <div className="relative">
                        <div className="absolute inset-0 scale-150 bg-blue-500/10 blur-xl rounded-full" />
                        <div className="relative w-12 h-12 rounded-full bg-[#0a0a0c] border border-blue-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.2)]">
                            <UserCheck className="w-6 h-6 text-blue-400" />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 w-fit mx-auto">
                            <span className="text-[8px] font-black text-blue-400 uppercase tracking-widest">Human Protocol</span>
                        </div>
                        <h3 className="text-lg font-black text-white tracking-widest uppercase italic">{label || 'Approval Gate'}</h3>
                    </div>

                    <div className="flex items-center gap-2 w-full pt-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); onApprove?.(); }}
                            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition-all group/btn"
                        >
                            <Check className="w-4 h-4 mb-1" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Verify</span>
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onReject?.(); }}
                            className="flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all group/btn"
                        >
                            <X className="w-4 h-4 mb-1" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Deny</span>
                        </button>
                    </div>
                </div>

                {/* --- Handles --- */}

                {/* Main Ingress (Left) */}
                <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex items-center group/ingress">
                    <span className="absolute right-10 text-[7px] font-black text-blue-500 tracking-wider opacity-0 group-hover/ingress:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-blue-500/20 pointer-events-none">Review Ingress</span>
                    <Handle
                        type="target"
                        position={Position.Left}
                        id="approval-ingress"
                        isValidConnection={isValidConnection}
                        className="!w-8 !h-8 !bg-blue-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(59,130,246,0.5)] !flex items-center justify-center pointer-events-auto transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-blue-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-blue-500/40"
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
                    </Handle>
                </div>

                {/* Integrated Outputs (Right) */}
                <div className="absolute -right-3 top-[10%] bottom-[10%] flex flex-col justify-around group/outputs">
                    <div className="relative flex items-center justify-end h-8">
                        <span className="absolute right-12 text-[7px] font-black text-emerald-400 tracking-widest uppercase opacity-0 group-hover/outputs:opacity-100 transition-all bg-black/80 px-2 py-1 rounded border border-emerald-500/20 whitespace-nowrap">PASSED</span>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="approval-egress"
                            isValidConnection={isValidConnection}
                            className="!w-8 !h-8 !bg-emerald-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(16,185,129,0.5)] !relative !right-0 !top-0 !translate-y-0 pointer-events-auto !flex items-center justify-center transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-emerald-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-emerald-500/40"
                        >
                            <div className="w-full h-full flex items-center justify-center pointer-events-none">
                                <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
                            </div>
                        </Handle>
                    </div>

                    <div className="relative flex items-center justify-end h-8">
                        <span className="absolute right-12 text-[7px] font-black text-red-400 tracking-widest uppercase opacity-0 group-hover/outputs:opacity-100 transition-all bg-black/80 px-2 py-1 rounded border border-red-500/20 whitespace-nowrap">DENIED</span>
                        <Handle
                            type="source"
                            position={Position.Right}
                            id="approval-reject"
                            isValidConnection={isValidConnection}
                            className="!w-8 !h-8 !bg-red-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(239,68,68,0.5)] !relative !right-0 !top-0 !translate-y-0 pointer-events-auto !flex items-center justify-center transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-red-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-red-500/40"
                        >
                            <div className="w-full h-full flex items-center justify-center pointer-events-none">
                                <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
                            </div>
                        </Handle>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TestLabApprovalNode;
