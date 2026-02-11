import React from 'react';
import {
    Menu,
    Plus,
    Minus,
    Maximize,
    RotateCcw,
    RotateCw,
    Bot
} from 'lucide-react';

export const TestLabSidebar: React.FC = () => {
    return (
        <div className="absolute top-10 left-6 z-[100] flex flex-col items-center gap-4 p-2.5 rounded-2xl border border-white/10 bg-[#0a0a0c]/80 backdrop-blur-xl shadow-2xl shadow-black/50">

            <div className="w-8 h-px bg-white/5" />

            {/* Navigation Actions */}
            <button className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group" title="Menu">
                <Menu className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group" title="Zoom In">
                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group" title="Zoom Out">
                <Minus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group" title="Fit View">
                <Maximize className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <div className="w-8 h-px bg-white/5" />

            {/* History Actions */}
            <button className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group" title="Undo">
                <RotateCcw className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group" title="Redo">
                <RotateCw className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
        </div>
    );
};
