
import React from 'react';
import { Plus, Database, Bot, Scale, Copy, Play, Download, Swords } from 'lucide-react';

interface TestLabToolbarProps {
    onAddInput: () => void;
    onAddAgent: () => void;
    onAddEval: () => void;
    onCloneLive: () => void;
    onBattle: () => void;
}

export const TestLabToolbar: React.FC<TestLabToolbarProps> = ({
    onAddInput,
    onAddAgent,
    onAddEval,
    onCloneLive,
    onBattle
}) => {
    return (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 p-2 rounded-full border border-white/10 bg-[#0a0a0c]/80 backdrop-blur-xl shadow-2xl shadow-black/50">

            {/* Unified Node Pills */}
            <div className="flex items-center bg-white/[0.03] rounded-full p-1.5 gap-2">
                <button
                    onClick={onAddInput}
                    className="flex items-center gap-3 px-4 py-2 rounded-full hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 transition-all group"
                >
                    <Play className="w-4 h-4 fill-emerald-500 text-emerald-500" />
                    <span className="text-[12px] font-bold tracking-tight">Add Input</span>
                </button>

                <div className="w-[1px] h-4 bg-white/10" />

                <button
                    onClick={onAddAgent}
                    className="flex items-center gap-3 px-4 py-2 rounded-full hover:bg-violet-500/20 text-slate-300 hover:text-violet-400 transition-all group"
                >
                    <Database className="w-4 h-4 fill-violet-500 text-violet-500" />
                    <span className="text-[12px] font-bold tracking-tight">Add Agent</span>
                </button>

                <div className="w-[1px] h-4 bg-white/10" />

                <button
                    onClick={onAddEval}
                    className="flex items-center gap-3 px-4 py-2 rounded-full hover:bg-blue-500/20 text-slate-300 hover:text-blue-400 transition-all group"
                >
                    <Scale className="w-4 h-4 fill-blue-500 text-blue-500" />
                    <span className="text-[12px] font-bold tracking-tight">Add Eval</span>
                </button>
            </div>

            <div className="w-[1px] h-8 bg-white/10 mx-3" />

            {/* Utility Actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={onCloneLive}
                    className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/[0.05] hover:bg-white/10 text-slate-300 hover:text-white transition-all border border-white/5 group"
                    title="Import Config from Live"
                >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span className="text-[12px] font-bold tracking-tight">Import Live</span>
                </button>

                <button
                    onClick={onBattle}
                    className="flex items-center gap-3 px-6 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white font-black text-[12px] uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:scale-105 active:scale-95 border border-violet-400/30"
                >
                    <Swords className="w-4 h-4" />
                    Battle [Live vs Lab]
                </button>
            </div>
        </div>
    );
};
