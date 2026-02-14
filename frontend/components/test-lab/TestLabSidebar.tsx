import React, { useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import {
    Menu,
    Plus,
    Minus,
    Maximize,
    RotateCcw,
    RotateCw,
    Bot
} from 'lucide-react';

interface TestLabSidebarProps {
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
}

export const TestLabSidebar: React.FC<TestLabSidebarProps> = ({
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false
}) => {
    const { zoomIn, zoomOut, fitView } = useReactFlow();

    const handleZoomIn = useCallback(() => zoomIn({ duration: 300 }), [zoomIn]);
    const handleZoomOut = useCallback(() => zoomOut({ duration: 300 }), [zoomOut]);
    const handleFitView = useCallback(() => fitView({ duration: 300, padding: 0.2 }), [fitView]);

    // Menu will remain placeholder for now
    const handlePlaceholder = useCallback(() => {
        // Simple alert for now, can be replaced with a proper toast if available globally
        // alert("This feature is coming in a future update!");
    }, []);

    return (
        <div className="absolute top-10 left-6 z-[100] flex flex-col items-center gap-4 p-2.5 rounded-2xl border border-white/10 bg-[#0a0a0c]/80 backdrop-blur-xl shadow-2xl shadow-black/50">

            <div className="w-8 h-px bg-white/5" />

            {/* Navigation Actions */}
            <button
                onClick={handlePlaceholder}
                className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group"
                title="Menu"
            >
                <Menu className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button
                onClick={handleZoomIn}
                className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group"
                title="Zoom In"
            >
                <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button
                onClick={handleZoomOut}
                className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group"
                title="Zoom Out"
            >
                <Minus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button
                onClick={handleFitView}
                className="p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all group"
                title="Fit View"
            >
                <Maximize className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <div className="w-8 h-px bg-white/5" />

            {/* History Actions */}
            <button
                onClick={onUndo}
                className={`p-2.5 rounded-lg transition-all group ${canUndo ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-700 cursor-not-allowed'}`}
                title="Undo"
                disabled={!canUndo}
            >
                <RotateCcw className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <button
                onClick={onRedo}
                className={`p-2.5 rounded-lg transition-all group ${canRedo ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-slate-700 cursor-not-allowed'}`}
                title="Redo"
                disabled={!canRedo}
            >
                <RotateCw className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
        </div>
    );
};
