import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Bot, Edit, Trash2, Settings } from 'lucide-react';

export type TestLabBoxNodeData = {
    label: string;
    model?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    inputCount?: number;
    onEdit?: () => void;
    onDelete?: () => void;
    status?: 'idle' | 'running' | 'completed' | 'error';
};

export const TestLabBoxNode: React.FC<NodeProps<TestLabBoxNodeData>> = ({ data, selected }) => {
    const { label, model = 'gpt-4o', onEdit, onDelete, status = 'idle' } = data;

    const statusColors = {
        idle: 'border-violet-500/30',
        running: 'border-violet-500 shadow-lg shadow-violet-500/20',
        completed: 'border-violet-400',
        error: 'border-red-500',
    };

    const statusBgColors = {
        idle: 'bg-violet-500/5',
        running: 'bg-violet-500/10',
        completed: 'bg-violet-400/10',
        error: 'bg-red-500/10',
    };

    return (
        <div
            className={`
                relative min-w-[220px] rounded-lg border-2 transition-all
                ${selected ? 'border-violet-400 shadow-xl shadow-violet-500/30' : statusColors[status]}
                ${statusBgColors[status]}
                backdrop-blur-sm
            `}
        >
            {/* Input Handle */}
            <Handle
                type="target"
                position={Position.Left}
                className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-300"
            />

            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-violet-500/20 bg-violet-500/10">
                <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-violet-400" />
                    <span className="text-sm font-semibold text-violet-300">{label}</span>
                </div>
                <div className="flex items-center gap-1">
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="p-1 rounded hover:bg-violet-500/20 text-violet-400 transition-colors"
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
                <div className="flex items-center gap-2">
                    <Settings className="w-3 h-3 text-slate-500" />
                    <span className="text-xs text-slate-400">{model}</span>
                </div>
                {status === 'running' && (
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse"></div>
                        <span className="text-xs text-violet-300">Running...</span>
                    </div>
                )}
                {status === 'completed' && (
                    <div className="text-xs text-green-400">✓ Completed</div>
                )}
                {status === 'error' && (
                    <div className="text-xs text-red-400">✗ Error</div>
                )}
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-violet-500 !border-2 !border-violet-300"
            />
        </div>
    );
};

export default TestLabBoxNode;
