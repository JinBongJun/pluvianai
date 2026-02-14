'use client';

import React from 'react';
import {
    Trash2,
    Activity, Play, Zap, GitBranch, CheckCircle2, FileText, Database, LineChart
} from 'lucide-react';
import clsx from 'clsx';

import { AgentSuite } from './inspector/AgentSuite';
import { EvalSuite } from './inspector/EvalSuite';
import { RouterSuite } from './inspector/RouterSuite';
import { ApprovalSuite } from './inspector/ApprovalSuite';
import { InputSuite } from './inspector/InputSuite';

// --- Node Identity Component ---

interface NodeIdentityProps {
    node: any;
    onUpdate: (data: any) => void;
}

const NodeIdentity: React.FC<NodeIdentityProps> = ({ node, onUpdate }) => {
    return (
        <div className="px-10 pt-8 pb-4">
            <input
                type="text"
                value={node.data.label || ''}
                onChange={(e) => onUpdate({ label: e.target.value })}
                placeholder="Node Name"
                className="w-full bg-transparent text-2xl font-black text-white outline-none border-b border-white/10 pb-2 focus:border-white/30 transition-colors"
            />
            <span className="text-[10px] font-mono text-slate-700 mt-2 block">ID: {node.id}</span>
        </div>
    );
};

// --- Specialized Action Ribbon ---

const QuickActionRibbon = ({
    nodeType,
    nodeText,
    nodeColor
}: {
    nodeType: string;
    nodeText: string;
    nodeColor: string;
}) => {
    const actionMap: Record<string, { primary: string; secondary: string; primaryIcon: any; secondaryIcon: any }> = {
        agentCard: {
            primary: 'Inference',
            secondary: 'Monitor Vitals',
            primaryIcon: Play,
            secondaryIcon: Activity
        },
        evalNode: {
            primary: 'Run Scoring',
            secondary: 'Drift Analysis',
            primaryIcon: Zap,
            secondaryIcon: LineChart
        },
        routerNode: {
            primary: 'Test Logic',
            secondary: 'History',
            primaryIcon: GitBranch,
            secondaryIcon: Database
        },
        approvalNode: {
            primary: 'Approve',
            secondary: 'Logs',
            primaryIcon: CheckCircle2,
            secondaryIcon: FileText
        },
        inputNode: {
            primary: 'Inject',
            secondary: 'Vault',
            primaryIcon: Play,
            secondaryIcon: Database
        }
    };

    const actions = actionMap[nodeType] || actionMap.agentCard;
    const PrimaryIcon = actions.primaryIcon;
    const SecondaryIcon = actions.secondaryIcon;

    return (
        <div className="px-10 py-8 grid grid-cols-2 gap-4">
            <button className={clsx(
                "py-4 rounded-2xl border flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg",
                nodeText,
                nodeColor.replace('bg-', 'bg-').concat('/10'),
                nodeColor.replace('bg-', 'border-').concat('/20'),
                "hover:bg-opacity-20"
            )}>
                <PrimaryIcon className="w-4 h-4 fill-current" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">{actions.primary}</span>
            </button>
            <button className="py-4 rounded-2xl bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center gap-3 hover:bg-white/10 transition-all active:scale-95">
                <SecondaryIcon className="w-4 h-4" />
                <span className="text-[11px] font-black uppercase tracking-[0.2em]">{actions.secondary}</span>
            </button>
        </div>
    );
};

// --- Main Inspector ---

export interface TestLabInspectorProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const TestLabInspector: React.FC<TestLabInspectorProps> = ({ node, onUpdate }) => {
    // Note: The logic for the main header (title/icon) is handled by RailwaySidePanel
    // We only need to render the contents here.

    const themeColorMap: any = {
        agentCard: 'bg-violet-500',
        evalNode: 'bg-cyan-500',
        routerNode: 'bg-amber-500',
        approvalNode: 'bg-blue-500',
        inputNode: 'bg-emerald-500',
    };

    const themeTextMap: any = {
        agentCard: 'text-violet-500',
        evalNode: 'text-cyan-500',
        routerNode: 'text-amber-500',
        approvalNode: 'text-blue-500',
        inputNode: 'text-emerald-500',
    };

    const nodeColor = themeColorMap[node.type] || 'bg-slate-500';
    const nodeText = themeTextMap[node.type] || 'text-slate-500';

    const handleDelete = () => {
        if (window.confirm(`Are you sure you want to remove this ${node.data.label || 'node'}?`)) {
            node.data.onDelete?.();
        }
    };

    return (
        <div className="flex flex-col h-full text-slate-200">
            {/* Node Renaming Section */}
            <NodeIdentity node={node} onUpdate={onUpdate} />

            {/* Action Ribbon - Prominent and Spacious */}
            <QuickActionRibbon
                nodeType={node.type}
                nodeText={nodeText}
                nodeColor={nodeColor}
            />

            {/* Specialized Suites */}
            <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700 overflow-y-auto scrollbar-hide">
                {node.type === 'agentCard' && <AgentSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'evalNode' && <EvalSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'routerNode' && <RouterSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'approvalNode' && <ApprovalSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'inputNode' && <InputSuite node={node} onUpdate={onUpdate} />}

                {/* Danger Zone */}
                <div className="px-10 pb-10">
                    <button
                        onClick={handleDelete}
                        className="w-full py-5 rounded-[2rem] bg-red-500/5 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-red-500/10 transition-all flex items-center justify-center gap-3 group"
                    >
                        <Trash2 className="w-4 h-4 group-hover:animate-bounce" />
                        Remove Specimen from Grid
                    </button>
                </div>
            </div>

            {/* Status Indicator */}
            <div className="mx-10 mb-8 p-5 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-between mt-auto">
                <div className="flex items-center gap-3">
                    <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_12px_currentColor]", nodeText)} />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Active Diagnosis</span>
                </div>
                <span className="text-[10px] font-mono text-slate-700">SIG: {node.id.split('-')[1]?.substring(0, 8) || node.id}</span>
            </div>
        </div>
    );
};
