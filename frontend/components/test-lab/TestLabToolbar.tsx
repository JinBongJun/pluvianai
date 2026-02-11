
import React from 'react';
import { Plus, Database, Bot, Scale, Copy, Play } from 'lucide-react';

interface TestLabToolbarProps {
    onAddInput: () => void;
    onAddAgent: () => void;
    onAddEval: () => void;
    onCloneLive: () => void;
    onRunTest: () => void;
}

export const TestLabToolbar: React.FC<TestLabToolbarProps> = ({
    onAddInput,
    onAddAgent,
    onAddEval,
    onCloneLive,
    onRunTest
}) => {
    return (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1.5 p-1.5 rounded-xl border border-white/10 bg-[#0a0a0c]/80 backdrop-blur-xl shadow-2xl shadow-black/50">

            {/* Add Input Node */}
            <button
                onClick={onAddInput}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 hover:bg-emerald-500/20 text-emerald-400/80 hover:text-emerald-300 transition-all border border-transparent hover:border-emerald-500/30 group"
                title="Add Input Source"
            >
                <div className="p-1 rounded bg-emerald-500/20 text-emerald-400 group-hover:scale-110 transition-transform">
                    <Database className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider">Input</span>
            </button>

            <div className="w-px h-4 bg-white/10" />

            {/* Add Agent Node */}
            <button
                onClick={onAddAgent}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-500/5 hover:bg-violet-500/20 text-violet-400/80 hover:text-violet-300 transition-all border border-transparent hover:border-violet-500/30 group"
                title="Add Agent Processor"
            >
                <div className="p-1 rounded bg-violet-500/20 text-violet-400 group-hover:scale-110 transition-transform">
                    <Bot className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider">Agent</span>
            </button>

            <div className="w-px h-4 bg-white/10" />

            {/* Add Eval Node */}
            <button
                onClick={onAddEval}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/5 hover:bg-cyan-500/20 text-cyan-400/80 hover:text-cyan-300 transition-all border border-transparent hover:border-cyan-500/30 group"
                title="Add Evaluator"
            >
                <div className="p-1 rounded bg-cyan-500/20 text-cyan-400 group-hover:scale-110 transition-transform">
                    <Scale className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider">Eval</span>
            </button>

            <div className="w-px h-6 bg-white/10 mx-1" />

            {/* Clone Action */}
            <button
                onClick={onCloneLive}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                title="Clone from Live"
            >
                <div className="p-1 rounded bg-white/10 text-white">
                    <Copy className="w-3.5 h-3.5" />
                </div>
                <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider">Clone Live</span>
            </button>

            <div className="w-px h-6 bg-white/10 mx-1" />

            {/* Run Test Action - Glowing Primary Button */}
            <button
                onClick={onRunTest}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all group"
                title="Execute Chain"
            >
                <div className="p-1 rounded bg-white/20 text-white group-hover:scale-110 transition-transform">
                    <Play className="w-3.5 h-3.5 fill-current" />
                </div>
                <span className="text-[11px] font-black uppercase tracking-wider">Run Test</span>
            </button>
        </div>
    );
};
