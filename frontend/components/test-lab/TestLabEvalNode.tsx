
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
                "relative min-w-[280px] rounded-xl border-2 transition-all p-0 group backdrop-blur-xl scale-105",
                selected
                    ? "border-cyan-400 shadow-[0_0_25px_rgba(34,211,238,0.5)] bg-[#1a1a1e]"
                    : statusColors[status]
            )}
        >
            {/* Input Handle (Left) - Cyan Logic */}
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex items-center">
                <span className="absolute right-4 text-[7px] font-black text-cyan-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">IN</span>
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !bg-cyan-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-transform hover:scale-125"
                />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-cyan-500/5">
                <div className="flex items-center gap-3">
                    <div className={clsx("p-2 rounded-lg", status === 'evaluating' ? "bg-cyan-500/20 text-cyan-400" : "bg-white/5 text-slate-400")}>
                        <Scale className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-base font-bold text-white tracking-tight leading-none mb-1">{label || 'Evaluator'}</span>
                        <span className="text-[10px] font-mono text-cyan-500/70 uppercase tracking-wider">
                            Signal Engine
                        </span>
                    </div>
                </div>
                {/* Status Icon */}
                <div>
                    {status === 'passed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    {status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                    {status === 'warning' && <AlertCircle className="w-5 h-5 text-amber-500" />}
                    {status === 'evaluating' && <BarChart3 className="w-5 h-5 text-cyan-500 animate-spin" />}
                </div>
            </div>

            {/* Content Area */}
            <div className="p-3 space-y-3">

                {/* 1. Main Score */}
                <div className="flex items-center justify-between bg-black/20 rounded p-2 border border-white/5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Overall Quality</span>
                    <span className={clsx(
                        "text-lg font-black font-mono",
                        status === 'passed' ? "text-emerald-400" :
                            status === 'failed' ? "text-red-400" : "text-slate-500"
                    )}>
                        {status === 'pending' ? '--' : '98.5%'}
                    </span>
                </div>

                {/* 2. Detailed Signals */}
                <div className="space-y-1">
                    <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold mb-1">
                        <span>Signal Check</span>
                        <span>Score</span>
                    </div>

                    {['Hallucination', 'Safety', 'Tone'].map((sig, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] py-1 border-b border-dashed border-white/5 last:border-0">
                            <span className="text-slate-300">{sig}</span>
                            <div className="flex items-center gap-2">
                                <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-cyan-500"
                                        style={{ width: `${Math.random() * 40 + 60}%` }}
                                    />
                                </div>
                                <span className="font-mono text-cyan-400">
                                    {(Math.random() * 10 + 90).toFixed(1)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};
