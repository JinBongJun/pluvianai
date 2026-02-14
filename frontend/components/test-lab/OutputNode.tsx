import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { BarChart2, Edit, Trash2, Zap, ChevronRight } from 'lucide-react';

import { Signal } from '@/lib/schemas';

export type OutputNodeData = {
    label: string;
    signals?: Signal[];
    onEdit?: () => void;
    onDelete?: () => void;
    status?: 'idle' | 'running' | 'completed' | 'error' | 'pass' | 'fail';
};

const OutputNode: React.FC<NodeProps<OutputNodeData>> = ({ data, selected }) => {
    const { label, signals = [], onEdit, onDelete, status = 'idle' } = data;

    const statusColors = {
        idle: 'border-blue-500/30',
        running: 'border-blue-500 shadow-lg shadow-blue-500/20',
        completed: 'border-blue-400',
        error: 'border-red-500',
        pass: 'border-green-500',
        fail: 'border-red-500',
    };

    const statusBgColors = {
        idle: 'bg-blue-500/5',
        running: 'bg-blue-500/10',
        completed: 'bg-blue-400/10',
        error: 'bg-red-500/10',
        pass: 'bg-green-500/10',
        fail: 'bg-red-500/10',
    };

    return (
        <div
            className={`
                relative min-w-[200px] rounded-lg border-2 transition-all
                ${selected ? 'border-blue-400 shadow-xl shadow-blue-500/30' : statusColors[status]}
                ${statusBgColors[status]}
                backdrop-blur-sm
            `}
        >
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-8 !h-8 !bg-blue-500 !border-2 !border-[#0a0a0c] !shadow-[0_0_15px_rgba(59,130,246,0.5)] !flex items-center justify-center transition-all hover:scale-125 react-flow__handle-connecting:ring-2 react-flow__handle-connecting:ring-blue-500/10 react-flow__handle-valid:ring-4 react-flow__handle-valid:ring-blue-500/40"
            >
                <div className="w-2.5 h-2.5 rounded-full bg-[#0a0a0c]" />
            </Handle>

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-blue-500/20 bg-blue-500/10">
                <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-blue-300">{label}</span>
                </div>
                <div className="flex items-center gap-1">
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="p-1 rounded hover:bg-blue-500/20 text-blue-400 transition-colors"
                        >
                            <Edit className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={onDelete}
                            className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-3 space-y-2">
                <div className="text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-yellow-400" />
                        <span>{signals.length} Signal{signals.length !== 1 ? 's' : ''}</span>
                    </div>
                </div>
                {signals.length > 0 && (
                    <div className="space-y-1">
                        {signals.slice(0, 3).map((signal) => (
                            <div
                                key={signal.id}
                                className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1.5"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400"></div>
                                <span className="truncate">{signal.name}</span>
                            </div>
                        ))}
                        {signals.length > 3 && (
                            <div className="text-xs px-2 py-1 text-slate-500">
                                +{signals.length - 3} more
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default OutputNode;
