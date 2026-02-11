
import React, { useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Database, FileText, Image as ImageIcon, AlertTriangle, Star } from 'lucide-react';
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
                "relative min-w-[300px] rounded-lg border-2 transition-all p-0 group bg-[#0a0a0c]/90 backdrop-blur-xl",
                selected
                    ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                    : "border-emerald-500/30 hover:border-emerald-500/50"
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-emerald-500/5">
                <div className="flex items-center gap-2.5">
                    <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400">
                        <Database className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-bold text-white tracking-tight leading-none mb-0.5">{label || 'Input Source'}</span>
                        <span className="text-[9px] font-mono text-emerald-500/70 uppercase tracking-wider">
                            {inputType === 'multimodal' ? 'Multimodal Payload' : 'Text Payload'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-3 space-y-3">

                {/* 1. Main Text Input */}
                <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        Main Prompt
                    </label>
                    <textarea
                        className="w-full h-20 bg-[#050505] border border-white/10 rounded-md p-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 resize-none font-mono leading-relaxed placeholder:text-slate-700"
                        placeholder="Enter your test prompt here..."
                        value={textInput}
                        onChange={(e) => onTextChange?.(e.target.value)}
                    />
                </div>

                {/* 2. Attachments Zone */}
                <div
                    className="border border-dashed border-white/10 rounded-md p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/5 transition-colors cursor-pointer group/drop"
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                >
                    <div className="p-2 rounded-full bg-white/5 group-hover/drop:bg-emerald-500/20 transition-colors">
                        <ImageIcon className="w-4 h-4 text-slate-500 group-hover/drop:text-emerald-400" />
                    </div>
                    <span className="text-[10px] text-slate-500 group-hover/drop:text-slate-300">
                        Drag & Drop files or images
                    </span>
                    {attachments.length > 0 && (
                        <div className="w-full flex flex-wrap gap-1 mt-1">
                            {attachments.map((file, i) => (
                                <div key={i} className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] text-emerald-400 truncate max-w-full">
                                    {file.name}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 3. Examples Toggle (Worst/Golden) */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="p-2 rounded bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors cursor-pointer">
                        <div className="flex items-center gap-1.5 mb-1">
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                            <span className="text-[9px] font-bold text-red-400 uppercase">Worst Case</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                            {worstExamples.length} examples
                        </div>
                    </div>
                    <div className="p-2 rounded bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-colors cursor-pointer">
                        <div className="flex items-center gap-1.5 mb-1">
                            <Star className="w-3 h-3 text-amber-500" />
                            <span className="text-[9px] font-bold text-amber-400 uppercase">Golden Case</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                            {goldenExamples.length} examples
                        </div>
                    </div>
                </div>

            </div>

            {/* Output Handle (Right Only) */}
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex items-center justify-end">
                <span className="absolute left-4 text-[7px] font-black text-emerald-500 tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">OUT</span>
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-[#0a0a0c] shadow-[0_0_10px_rgba(16,185,129,0.5)] transition-transform hover:scale-125"
                />
            </div>
        </div>
    );
};
