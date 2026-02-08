import React from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Database, Edit, Trash2 } from 'lucide-react';
import { ContentBlock } from '@/types/test-lab/content-blocks';

export type VariableType = 'text' | 'image' | 'json';

export interface VariableDefinition {
    id: string;
    name: string;
    type: VariableType;
}

export interface TestCase {
    id: string;
    [key: string]: any; // Dynamic fields based on variables
}

export type InputNodeData = {
    label: string;
    inputs?: ContentBlock[];
    variables?: VariableDefinition[];
    testCases?: TestCase[];
    onEdit?: () => void;
    onDelete?: () => void;
    status?: 'idle' | 'running' | 'completed' | 'error';
};

const InputNode: React.FC<NodeProps<InputNodeData>> = ({ data, selected }) => {
    const { label, variables = [], testCases = [], onEdit, onDelete, status = 'idle' } = data;

    const statusColors = {
        idle: 'border-emerald-500/30',
        running: 'border-emerald-500 shadow-lg shadow-emerald-500/20',
        completed: 'border-emerald-400',
        error: 'border-red-500',
    };

    const statusBgColors = {
        idle: 'bg-emerald-500/5',
        running: 'bg-emerald-500/10',
        completed: 'bg-emerald-400/10',
        error: 'bg-red-500/10',
    };

    return (
        <div
            className={`
                relative min-w-[200px] rounded-lg border-2 transition-all
                ${selected ? 'border-emerald-400 shadow-xl shadow-emerald-500/30' : statusColors[status]}
                ${statusBgColors[status]}
                backdrop-blur-sm
            `}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-emerald-500/20 bg-emerald-500/10">
                <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-300">{label}</span>
                </div>
                <div className="flex items-center gap-1">
                    {onEdit && (
                        <button
                            onClick={onEdit}
                            className="p-1 rounded hover:bg-emerald-500/20 text-emerald-400 transition-colors"
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
                    <div className="flex items-center justify-between">
                        <span>Variables: {variables.length}</span>
                        <span>Test Cases: {testCases.length}</span>
                    </div>
                </div>
                {variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {variables.slice(0, 3).map((v) => (
                            <span
                                key={v.id}
                                className="text-xs px-2 py-0.5 rounded bg-violet-500/10 text-violet-300 font-mono border border-violet-500/20"
                            >
                                {`{{${v.name}}}`}
                            </span>
                        ))}
                        {variables.length > 3 && (
                            <span className="text-xs px-2 py-0.5 text-slate-500">
                                +{variables.length - 3} more
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Output Handle */}
            <Handle
                type="source"
                position={Position.Right}
                className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-emerald-300"
            />
        </div>
    );
};

export default InputNode;
