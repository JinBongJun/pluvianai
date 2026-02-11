
import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Scale, CheckCircle2, XCircle, AlertCircle, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

export type TestLabEvalNodeData = {
    label: string;
    metrics: {
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
};

export const TestLabEvalNode: React.FC<NodeProps<TestLabEvalNodeData>> = ({ data, selected }) => {
    const {
        label,
        metrics = { accuracy: 0, hallucination: 0, tone: 0 },
        status = 'pending',
        signals = []
    } = data;

    const statusColors = {
        pending: 'border-slate-700 bg-slate-500/5',
        evaluating: 'border-cyan-500 animate-pulse bg-cyan-500/10',
        passed: 'border-emerald-500 bg-emerald-500/10',
        failed: 'border-red-500 bg-red-500/10',
        warning: 'border-amber-500 bg-amber-500/10'
    };

    return (
        <div
            className={clsx(
                "relative flex items-center gap-3 px-4 py-2.5 rounded-full border-2 transition-all p-0 group bg-[#0a0a0c]/90 backdrop-blur-xl",
                selected
                    ? "border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.5)] bg-[#1a1a1e]"
                    : statusColors[status]
            )}
        >
            {/* Input Handle (Left) - Cyan Logic */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex items-center">
                <span className="absolute right-4 text-[7px] font-black text-cyan-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity uppercase">Target</span>
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-transform hover:scale-125"
                />
            </div>

            <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                    <BarChart3 className={clsx("w-2.5 h-2.5 text-cyan-500", status === 'evaluating' && "animate-spin")} />
                    <span className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Evaluate</span>
                </div>
                <span className="text-sm font-bold text-white tracking-tight whitespace-nowrap">{label || 'Evaluator'}</span>
            </div>
        </div>
    );
};
