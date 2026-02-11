
import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Database, FileText, Image as ImageIcon, AlertTriangle, Star, Play } from 'lucide-react';
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
};

export const TestLabInputNode: React.FC<NodeProps<TestLabInputNodeData>> = ({ data, selected }) => {
    const {
        label,
        textInput,
        onTextChange,
        attachments = [],
        worstExamples = [],
        goldenExamples = [],
        inputType = 'text'
    } = data;

    // Handlers for dragging files (Placeholder logic)
    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }, []);

    const onDrop = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        // Logical placeholder for file drop
        console.log('Files dropped:', event.dataTransfer.files);
    }, []);

    return (
        <div
            className={clsx(
                "relative flex items-center gap-3 px-4 py-2.5 rounded-full border-2 transition-all p-0 group bg-[#0a0a0c]/90 backdrop-blur-xl",
                selected
                    ? "border-emerald-500 shadow-[0_0_30px_rgba(16,185,129,0.5)]"
                    : "border-emerald-500/30 hover:border-emerald-500/50"
            )}
        >
            <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    <Play className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                    <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Start</span>
                </div>
                <span className="text-sm font-bold text-white tracking-tight whitespace-nowrap">{label || 'User Inputs'}</span>
            </div>

            {/* Output Handle (Right Only) */}
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-end">
                <span className="absolute left-4 text-[7px] font-black text-emerald-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity uppercase">Source</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-transform hover:scale-125"
                />
            </div>
        </div>
    );
};
