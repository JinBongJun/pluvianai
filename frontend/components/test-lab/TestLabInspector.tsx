'use client';

import React, { useState } from 'react';
import {
    Play,
    Zap,
    ChevronDown,
    Database,
    Activity,
    GitBranch,
    User,
    Settings,
    MessageSquare,
    AlertTriangle,
    Star,
    FileText,
    Shield,
    Sliders,
    ArrowRightLeft,
    CheckCircle2,
    XCircle,
    Bell,
    LineChart,
    Eye,
    Cpu
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

// --- Shared Components ---

interface InspectorSectionProps {
    icon: any;
    title: string;
    badge?: string | number;
    children: React.ReactNode;
    defaultOpen?: boolean;
    accentColor?: string;
}

const InspectorSection: React.FC<InspectorSectionProps> = ({
    icon: Icon,
    title,
    badge,
    children,
    defaultOpen = false,
    accentColor = 'text-slate-500'
}) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="mb-4 bg-white/[0.03] border border-white/5 rounded-3xl overflow-hidden shadow-sm">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-6 hover:bg-white/[0.02] transition-all group"
            >
                <div className="flex items-center gap-4">
                    <div className={clsx("p-2 rounded-xl bg-black/20", accentColor.replace('text-', 'text- opacity-20'))}>
                        <Icon className={clsx("w-5 h-5", accentColor)} />
                    </div>
                    <span className="text-[13px] font-black text-slate-300 uppercase tracking-[0.2em]">{title}</span>
                </div>
                <div className="flex items-center gap-3">
                    {badge !== undefined && (
                        <span className="px-2.5 py-1 rounded-full bg-white/5 text-[10px] font-black text-slate-500">{badge}</span>
                    )}
                    <ChevronDown className={clsx("w-5 h-5 text-slate-700 transition-transform duration-500", isOpen && "rotate-180")} />
                </div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="overflow-hidden"
                    >
                        <div className="px-6 pb-6 pt-2">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
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

// --- Specialized Diagnostic Suites ---

const AgentSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-6">
        <InspectorSection icon={Sliders} title="Model Engine" defaultOpen={true} accentColor="text-violet-500">
            <div className="space-y-5 pt-2">
                <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 px-1">Model Specimen</label>
                    <select
                        value={node.data.model || 'gpt-4o'}
                        onChange={(e) => onUpdate({ model: e.target.value })}
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all cursor-pointer font-mono"
                    >
                        <option value="gpt-4o">gpt-4o (Clinical)</option>
                        <option value="claude-3-5-sonnet-latest">claude-3.5-sonnet</option>
                        <option value="o1-preview">o1-preview (Deep Thinking)</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[9px] font-black text-slate-600 uppercase mb-2">Creativity (Temp)</label>
                        <input type="number" step="0.1" defaultValue={0.7} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono" />
                    </div>
                    <div>
                        <label className="block text-[9px] font-black text-slate-600 uppercase mb-2">Certainty (Top-P)</label>
                        <input type="number" step="0.1" defaultValue={1.0} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono" />
                    </div>
                </div>
            </div>
        </InspectorSection>

        <InspectorSection icon={Shield} title="Autonomy Guards" defaultOpen={true} accentColor="text-violet-400">
            <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-5 rounded-2xl bg-violet-500/5 border border-violet-500/10">
                    <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-violet-400" />
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-200">Neural Guardrail</span>
                            <span className="text-[10px] text-slate-600">Active monitoring enabled</span>
                        </div>
                    </div>
                    <div className="w-10 h-5 bg-black rounded-full border border-white/10 p-1 relative cursor-pointer">
                        <div className="absolute right-1 top-1 w-3 h-3 rounded-full bg-violet-500 shadow-lg shadow-violet-500/50" />
                    </div>
                </div>
                <div className="p-5 rounded-2xl bg-black/20 border border-white/5">
                    <label className="block text-[9px] font-black text-slate-600 uppercase mb-2 tracking-widest">Token Quota</label>
                    <div className="flex items-end gap-3">
                        <input type="number" defaultValue={4096} className="bg-transparent text-2xl font-black text-white outline-none w-24" />
                        <span className="text-xs text-slate-700 font-bold mb-1">TOKENS / CALL</span>
                    </div>
                </div>
            </div>
        </InspectorSection>

        <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
                <Cpu className="w-4 h-4 text-violet-500" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Behavior DNA (System)</label>
            </div>
            <textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                placeholder="Initialize agent behavior and constraints..."
                className="w-full h-80 bg-black/40 border border-white/10 rounded-[32px] p-8 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-violet-500/50 outline-none scrollbar-hide"
            />
        </div>
    </div>
);

const EvalSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-6">
        <InspectorSection icon={Activity} title="Success Signals" defaultOpen={true} accentColor="text-cyan-500">
            <div className="space-y-4 pt-4">
                {[
                    { label: 'Semantic Drift', type: 'Clinical', val: 0.12, color: 'bg-emerald-500' },
                    { label: 'Hallucination', type: 'Safety', val: 0.05, color: 'bg-rose-500' },
                    { label: 'Instruction Following', type: 'Performance', val: 0.94, color: 'bg-cyan-500' },
                ].map((sig) => (
                    <div key={sig.label} className="p-5 rounded-2xl bg-black/40 border border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[12px] font-black text-white uppercase tracking-wider">{sig.label}</span>
                                <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{sig.type} Indicator</span>
                            </div>
                            <span className="text-xl font-black text-slate-300 font-mono">{(sig.val * 10).toFixed(1)}</span>
                        </div>
                        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden shadow-inner">
                            <div className={clsx("h-full shadow-lg", sig.color)} style={{ width: `${sig.val * 100}%` }} />
                        </div>
                    </div>
                ))}
                <button className="w-full py-4 border border-dashed border-white/10 rounded-2xl text-[10px] font-black text-slate-500 hover:text-cyan-400 hover:border-cyan-400/50 transition-all uppercase tracking-[0.3em] bg-white/[0.01]">+ Add Clinical Signal</button>
            </div>
        </InspectorSection>
    </div>
);

const RouterSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-6">
        <InspectorSection icon={GitBranch} title="Branching Logic" defaultOpen={true} accentColor="text-amber-500">
            <div className="space-y-4 pt-4">
                {[
                    { condition: "score > 0.85", target: "Success Stage", color: "border-emerald-500/20" },
                    { condition: "toxicity > 0.1", target: "Safety Reject", color: "border-rose-500/20" },
                    { condition: "default", target: "Fallback Strategy", color: "border-amber-500/20" }
                ].map((route, i) => (
                    <div key={i} className={clsx("p-6 rounded-3xl bg-black/40 border transition-all", route.color)}>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Logic Rule #{i + 1}</span>
                            <Settings className="w-4 h-4 text-slate-700" />
                        </div>
                        <div className="flex items-center gap-4 text-sm font-mono text-white">
                            <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/5">{route.condition}</div>
                            <ArrowRightLeft className="w-4 h-4 text-slate-700 shrink-0" />
                            <div className="flex-1 p-3 rounded-xl bg-white/5 border border-white/5 font-bold text-amber-500">{route.target}</div>
                        </div>
                    </div>
                ))}
            </div>
        </InspectorSection>
    </div>
);

const ApprovalSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-6">
        <InspectorSection icon={User} title="Human Guard" defaultOpen={true} accentColor="text-blue-500">
            <div className="space-y-5 pt-4">
                <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Bell className="w-6 h-6 text-blue-400" />
                        <div className="flex flex-col">
                            <span className="text-sm font-black text-slate-200 uppercase tracking-widest">Priority Alert</span>
                            <span className="text-[10px] text-slate-600 uppercase font-bold">Email + SMS Trigger</span>
                        </div>
                    </div>
                    <div className="w-10 h-5 bg-black rounded-full border border-white/10 p-1 relative cursor-pointer">
                        <div className="absolute right-1 top-1 w-3 h-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/50" />
                    </div>
                </div>
            </div>
        </InspectorSection>
    </div>
);

const InputSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-6">
        <InspectorSection icon={Database} title="Patient Dataset" defaultOpen={true} accentColor="text-emerald-500">
            <div className="space-y-4 pt-4">
                <select className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white appearance-none cursor-pointer focus:ring-1 focus:ring-emerald-500/50">
                    <option>Surgical Trace Vault (Production Case #409)</option>
                    <option>Curated Clinical Baseline v2</option>
                    <option>Synthetic Adversarial Set</option>
                </select>
                <button className="w-full py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-emerald-500/20 transition-all shadow-lg shadow-emerald-500/5">Import Dataset</button>
            </div>
        </InspectorSection>

        <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
                <MessageSquare className="w-4 h-4 text-emerald-500" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Clinical Input (Raw Payload)</label>
            </div>
            <textarea
                value={node.data.textInput || ''}
                onChange={(e) => onUpdate({ textInput: e.target.value })}
                className="w-full h-48 bg-black/40 border border-white/10 rounded-[32px] p-8 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-emerald-500/50 outline-none scrollbar-hide"
            />
        </div>
    </div>
);

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

    return (
        <div className="flex flex-col h-full text-slate-200">
            {/* Action Ribbon - Prominent and Spacious */}
            <QuickActionRibbon
                nodeType={node.type}
                nodeText={nodeText}
                nodeColor={nodeColor}
            />

            {/* Specialized Suites */}
            <div className="flex-1 animate-in fade-in slide-in-from-bottom-4 duration-700">
                {node.type === 'agentCard' && <AgentSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'evalNode' && <EvalSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'routerNode' && <RouterSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'approvalNode' && <ApprovalSuite node={node} onUpdate={onUpdate} />}
                {node.type === 'inputNode' && <InputSuite node={node} onUpdate={onUpdate} />}
            </div>

            {/* Status Indicator */}
            <div className="mx-10 mb-8 p-5 rounded-3xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className={clsx("w-2 h-2 rounded-full shadow-[0_0_12px_currentColor]", nodeText)} />
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Active Diagnosis</span>
                </div>
                <span className="text-[10px] font-mono text-slate-700">SIG: {node.id.split('-')[1]?.substring(0, 8) || node.id}</span>
            </div>
        </div>
    );
};
