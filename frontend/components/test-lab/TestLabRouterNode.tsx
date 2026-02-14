'use client';

import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps, Connection, useReactFlow } from 'reactflow';
import { GitBranch, ChevronRight, Circle, Trash2 } from 'lucide-react';
import { checkClinicalConnection } from '@/lib/clinical-validation';

export type TestLabRouterNodeData = {
    label: string;
    branches?: { id: string, label: string }[];
    onEdit?: () => void;
    onDelete?: () => void;
};

export const TestLabRouterNode: React.FC<NodeProps<TestLabRouterNodeData>> = ({ id, data, selected }) => {
    const { label, onEdit, onDelete, branches = [] } = data;
    const { getNode } = useReactFlow();

    const isValidConnection = useCallback((connection: Connection) => {
        return checkClinicalConnection(
            connection,
            getNode(connection.source || ''),
            getNode(connection.target || '')
        );
    }, [getNode]);

    const activeBranches = branches.length > 0 ? branches : [
        { id: '1', label: 'BRANCH A' },
        { id: '2', label: 'BRANCH B' }
    ];

    return (
        <div className="relative group">
            {/* Hover Header - Name & Delete */}
            <div className="absolute -top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 z-50">
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                    className="px-3 py-1.5 rounded-xl bg-[#0a0a0c]/90 border border-amber-500/30 backdrop-blur-xl shadow-2xl flex items-center gap-2 hover:bg-amber-500/10 transition-all font-black text-slate-300 uppercase tracking-[0.2em] whitespace-nowrap"
                >
                    <GitBranch className="w-3 h-3 text-amber-500" />
                    {label || 'ROUTER'}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                    className="p-1.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 transition-all"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Diamond Shape - The Logic Core */}
            <div
                className={`
                    w-20 h-20 rotate-45 border-2 transition-all backdrop-blur-xl rounded-2xl relative
                    ${selected ? 'border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.6)] bg-[#1a1a1e]' : 'border-amber-500/30 bg-amber-500/5'}
                    hover:border-amber-400/50 group/diamond
                `}
            >
                {/* Visual Icon - Logic Chip Aesthetic - Minimalist */}
                <div className="-rotate-45 w-full h-full flex items-center justify-center">
                    <div className="relative">
                        {/* Outer Ring */}
                        <div className="absolute inset-0 scale-150 bg-amber-500/10 blur-xl rounded-full" />

                        {/* Inner Logic Hub */}
                        <div className="relative w-10 h-10 rounded-full bg-[#0a0a0c] border border-amber-500/50 flex items-center justify-center shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                            <GitBranch className="w-5 h-5 text-amber-500" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sub-label - Precision Diagnosis */}
            <div className="absolute top-28 left-1/2 -translate-x-1/2 whitespace-nowrap pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] font-black text-amber-600 uppercase tracking-[0.3em] italic">Logic Decision Hub</span>
            </div>

            {/* --- Handles --- */}

            {/* Main Ingress (Left) - Sequence Receiver */}
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 flex items-center group/ingress">
                <span className="absolute right-12 text-[7px] font-black text-amber-500 tracking-wider opacity-0 group-hover/ingress:opacity-100 transition-all uppercase whitespace-nowrap bg-[#0a0a0c]/80 px-2 py-0.5 rounded-full border border-amber-500/20 pointer-events-none">Logical Ingress</span>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="router-ingress"
                    isValidConnection={isValidConnection}
                    className="!w-8 !h-8 !bg-amber-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_10px_rgba(245,158,11,0.5)] !flex items-center justify-center pointer-events-auto transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-amber-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-amber-500/40"
                >
                    <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
                </Handle>
            </div>

            {/* Dynamic Output Branches (Right Side) - Integrated Silicon Bay */}
            <div className="absolute -right-16 top-1/2 -translate-y-1/2 flex items-center group/bay">
                {/* Connecting Bridge (SVG) - Static */}
                <div className="absolute -left-12 w-12 h-26 pointer-events-none">
                    <svg width="100%" height="100%" viewBox="0 0 48 96">
                        <path
                            d="M 48 48 L 0 10 L 0 86 Z"
                            fill="url(#bay-glow)"
                            className="opacity-40"
                        />
                        {/* Static Signal Dots */}
                        <circle r="1.8" fill="#fbbf24" opacity="0.2" cx="24" cy="48" />
                        <defs>
                            <radialGradient id="bay-glow" cx="100%" cy="50%" r="100%">
                                <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="transparent" />
                            </radialGradient>
                        </defs>
                    </svg>
                </div>

                {/* Glass Logic Substrate - Minimalist */}
                <div className="relative flex flex-col justify-center gap-3 px-4 py-8 min-h-[160px] bg-[#0a0a0c]/80 border border-amber-500/40 rounded-3xl backdrop-blur-2xl shadow-[0_0_40px_rgba(245,158,11,0.2)] border-l-amber-500/60 pointer-events-none group-hover/bay:border-amber-500 transition-all duration-500">
                    {/* Visual Rail Spine */}
                    <div className="absolute left-[41px] top-8 bottom-8 w-[1.5px] bg-gradient-to-b from-transparent via-amber-500/20 to-transparent" />

                    {activeBranches.map((branch, idx) => (
                        <div key={branch.id} className="relative flex items-center justify-end h-8 pointer-events-auto">
                            {/* Interactive Label */}
                            <div className="absolute right-12 opacity-0 group-hover/bay:opacity-100 transition-all duration-500 transform translate-x-4 group-hover/bay:translate-x-0 pointer-events-none z-20">
                                <span className="text-[7px] font-black text-amber-500 tracking-[0.3em] uppercase whitespace-nowrap bg-black/90 backdrop-blur-xl px-4 py-2 rounded-xl border border-amber-500/30 block group-hover:border-amber-500">
                                    {branch.label}
                                </span>
                            </div>

                            <Handle
                                type="source"
                                position={Position.Right}
                                id={`router-output-${branch.id}`}
                                isValidConnection={isValidConnection}
                                className="!w-8 !h-8 !bg-amber-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(245,158,11,0.5)] !flex items-center justify-center pointer-events-auto transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-amber-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-amber-500/40"
                            >
                                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                                    <ChevronRight className="w-5 h-5 text-[#0a0a0c]" strokeWidth={3} />
                                </div>
                            </Handle>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TestLabRouterNode;
