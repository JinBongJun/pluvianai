
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
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-1 p-1 rounded-full border border-white/10 bg-[#0a0a0c]/80 backdrop-blur-xl shadow-2xl shadow-black/50">

            {/* Unified Node Pills */}
            <div className="flex items-center bg-white/[0.03] rounded-full p-1 gap-1">
                <button
                    onClick={onAddInput}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 transition-all group"
                >
                    <Play className="w-3 h-3 fill-emerald-500 text-emerald-500" />
                    <span className="text-[10px] font-bold tracking-tight">Add Input</span>
                </button>

                <div className="w-[1px] h-3 bg-white/10" />

                <button
                    onClick={onAddAgent}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-violet-500/20 text-slate-300 hover:text-violet-400 transition-all group"
                >
                    <Database className="w-3 h-3 fill-violet-500 text-violet-500" />
                    <span className="text-[10px] font-bold tracking-tight">Add Agent</span>
                </button>

                <div className="w-[1px] h-3 bg-white/10" />

                <button
                    onClick={onAddEval}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-blue-500/20 text-slate-300 hover:text-blue-400 transition-all group"
                >
                    <Scale className="w-3 h-3 fill-blue-500 text-blue-500" />
                    <span className="text-[10px] font-bold tracking-tight">Add Eval</span>
                </button>
            </div>

            <div className="w-[1px] h-6 bg-white/10 mx-2" />

            {/* Utility Actions */}
            <button
                onClick={onCloneLive}
                className="p-2 rounded-full hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                title="Clone from Live"
            >
                <Copy className="w-4 h-4" />
            </button>

            <button
                onClick={onRunTest}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-[#0a0a0c] font-black text-[10px] uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 ml-1"
            >
                <Bot className="w-3 h-3" />
                Execute
            </button>
        </div>
    );
};
