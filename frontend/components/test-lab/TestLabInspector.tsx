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
    Cpu,
    Binary,
    ShieldCheck,
    ExternalLink, Trash2
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

// --- Specialized Diagnostic Suites ---

const AgentSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-8 flex flex-col h-full">
        <InspectorSection icon={Sliders} title="Model Specification" defaultOpen={true} accentColor="text-violet-500">
            <div className="space-y-6 pt-2">
                <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 px-1">Model Specimen</label>
                    <div className="relative group/select">
                        <select
                            value={node.data.model || 'gpt-4o'}
                            onChange={(e) => onUpdate({ model: e.target.value })}
                            className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white appearance-none focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all cursor-pointer font-black tracking-wider"
                        >
                            <option value="gpt-4o">GPT-4O (CLINICAL)</option>
                            <option value="claude-3-5-sonnet-latest">CLAUDE-3.5-SONNET</option>
                            <option value="o1-preview">O1-PREVIEW (DEEP THINKING)</option>
                        </select>
                        <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-hover/select:text-violet-500 transition-colors pointer-events-none" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-3xl bg-black/40 border border-white/5">
                        <label className="block text-[9px] font-black text-slate-700 uppercase mb-2 tracking-widest">Creativity</label>
                        <input type="number" step="0.1" defaultValue={0.7} className="w-full bg-transparent text-xl font-black text-white outline-none font-mono" />
                    </div>
                    <div className="p-4 rounded-3xl bg-black/40 border border-white/5">
                        <label className="block text-[9px] font-black text-slate-700 uppercase mb-2 tracking-widest">Certainty</label>
                        <input type="number" step="0.1" defaultValue={1.0} className="w-full bg-transparent text-xl font-black text-white outline-none font-mono" />
                    </div>
                </div>
            </div>
        </InspectorSection>

        <InspectorSection icon={Shield} title="Autonomy Guardrails" defaultOpen={true} accentColor="text-violet-400">
            <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between p-6 rounded-[2rem] bg-violet-500/5 border border-violet-500/10 hover:bg-violet-500/10 transition-all cursor-pointer">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-violet-500/10 shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                            <Zap className="w-6 h-6 text-violet-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[13px] font-black text-slate-200 uppercase tracking-widest">Neural Guardrail</span>
                            <span className="text-[9px] text-slate-600 uppercase font-bold tracking-widest">Active Safety Monitoring</span>
                        </div>
                    </div>
                    <div className="w-12 h-6 bg-black rounded-full border border-white/10 p-1 relative">
                        <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,1)]" />
                    </div>
                </div>
                <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Token Quota (Max)</label>
                        <span className="text-xs font-mono text-violet-400 font-bold">4,096</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-violet-500 w-2/3" />
                    </div>
                </div>
            </div>
        </InspectorSection>

        <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
                <Cpu className="w-4 h-4 text-violet-500" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Agent Behavior DNA (System Prompt)</label>
            </div>
            <textarea
                value={node.data.systemPrompt || ''}
                onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                placeholder="Initialize agent behavior and constraints..."
                className="w-full h-80 bg-black/60 border border-white/10 rounded-[2.5rem] p-10 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-violet-500/50 outline-none scrollbar-hide shadow-2xl"
            />
        </div>
    </div>
);

const EvalSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => {
    const diagnosticFactors = [
        { id: 'hallucination', label: 'Hallucination', type: 'Safety', val: 0.12, color: 'bg-rose-500' },
        { id: 'accuracy', label: 'Accuracy', type: 'Clinical', val: 0.94, color: 'bg-emerald-500' },
        { id: 'length', label: 'Length Change', type: 'Structure', val: 0.05, color: 'bg-cyan-500' },
        { id: 'refusal', label: 'Refusal Rate', type: 'Safety', val: 0.02, color: 'bg-amber-500' },
        { id: 'schema', label: 'Schema Integrity', type: 'Structure', val: 1.0, color: 'bg-blue-500' },
        { id: 'latency', label: 'Latency Spike', type: 'Performance', val: 0.08, color: 'bg-violet-500' },
        { id: 'cost', label: 'Token Economy', type: 'Performance', val: 0.15, color: 'bg-indigo-500' },
        { id: 'semantic', label: 'Semantic Drift', type: 'Quality', val: 0.1, color: 'bg-fuchsia-500' },
        { id: 'validator', label: 'Reg. Validator', type: 'Compliance', val: 0.88, color: 'bg-sky-500' },
        { id: 'consistency', label: 'Consistency', type: 'Quality', val: 0.91, color: 'bg-teal-500' },
        { id: 'tone', label: 'Clinical Tone', type: 'Brand', val: 0.85, color: 'bg-orange-500' },
        { id: 'coherence', label: 'Reasoning Coherence', type: 'Logic', val: 0.82, color: 'bg-yellow-500' },
        { id: 'custom', label: 'Custom Signal (PiI)', type: 'Privacy', val: 0.0, color: 'bg-neutral-500' },
    ];

    return (
        <div className="px-10 pb-10 space-y-6 flex flex-col h-full">
            <InspectorSection icon={Activity} title="13 Clinical Diagnostic Factors" defaultOpen={true} accentColor="text-cyan-500">
                <div className="grid grid-cols-1 gap-4 pt-4">
                    {diagnosticFactors.map((sig) => (
                        <div key={sig.id} className="p-5 rounded-2xl bg-black/40 border border-white/10 hover:border-cyan-500/30 transition-all group/factor">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex flex-col">
                                    <span className="text-[12px] font-black text-white uppercase tracking-wider group-hover/factor:text-cyan-400 transition-colors">{sig.label}</span>
                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">{sig.type} Protocol</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xl font-black text-slate-300 font-mono">{(sig.val * 10).toFixed(1)}</span>
                                    <div className="w-8 h-4 bg-black rounded-full border border-white/10 p-1 relative cursor-pointer">
                                        <div className="absolute right-1 top-1 w-2 h-2 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50" />
                                    </div>
                                </div>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={clsx("h-full", sig.color)} style={{ width: `${sig.val * 100}%` }} />
                            </div>
                        </div>
                    ))}
                    <button className="w-full py-4 border border-dashed border-white/10 rounded-2xl text-[10px] font-black text-slate-500 hover:text-cyan-400 hover:border-cyan-400/50 transition-all uppercase tracking-[0.3em] bg-white/[0.01] shadow-lg">+ Deploy Custom Sensor</button>
                </div>
            </InspectorSection>
        </div>
    );
};

const RouterSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => {
    const branches = node.data.branches || [
        { id: '1', label: 'CASE 1', condition: '' },
        { id: '2', label: 'CASE 2', condition: '' }
    ];

    const addBranch = () => {
        const nextId = (Math.max(...branches.map((b: any) => parseInt(b.id)), 0) + 1).toString();
        onUpdate({ branches: [...branches, { id: nextId, label: `CASE ${nextId}`, condition: '' }] });
    };

    const updateBranch = (id: string, field: string, value: string) => {
        const newBranches = branches.map((b: any) =>
            b.id === id ? { ...b, [field]: value } : b
        );
        onUpdate({ branches: newBranches });
    };

    const removeBranch = (id: string) => {
        if (branches.length <= 1) return;
        onUpdate({ branches: branches.filter((b: any) => b.id !== id) });
    };

    return (
        <div className="px-10 pb-10 space-y-8 flex flex-col h-full overflow-y-auto scrollbar-hide">
            {/* 1. Global Strategy (Decision Engine) */}
            <InspectorSection icon={Cpu} title="Logic Decision Engine" defaultOpen={true} accentColor="text-amber-500">
                <div className="space-y-6 pt-2">
                    <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 px-1">Logic Processing Model</label>
                        <div className="relative group/select">
                            <select
                                value={node.data.model || 'gpt-4o'}
                                onChange={(e) => onUpdate({ model: e.target.value })}
                                className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white appearance-none focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all cursor-pointer font-black tracking-wider"
                            >
                                <option value="gpt-4o">GPT-4O (REASONING)</option>
                                <option value="claude-3-5-sonnet-latest">CLAUDE-3.5-SONNET</option>
                                <option value="o1-preview">O1-PREVIEW (DEEP LOGIC)</option>
                            </select>
                            <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-hover/select:text-amber-500 transition-colors pointer-events-none" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-3">
                                <Binary className="w-3.5 h-3.5 text-amber-500" />
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Global Selection Strategy</label>
                            </div>
                        </div>
                        <textarea
                            value={node.data.systemPrompt || ''}
                            onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
                            placeholder="Define the overarching rules for selecting a branch..."
                            className="w-full h-32 bg-black/60 border border-white/5 rounded-2xl p-6 text-sm text-amber-500/80 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-amber-500/50 outline-none shadow-inner"
                        />
                    </div>
                </div>
            </InspectorSection>

            {/* 2. Switch-Case Branches */}
            <InspectorSection icon={GitBranch} title="Conditional Branch Mapping" defaultOpen={true} accentColor="text-amber-400">
                <div className="space-y-4 pt-4">
                    {branches.map((branch: any) => (
                        <div key={branch.id} className="p-6 rounded-[2rem] bg-black/40 border border-white/5 space-y-5 group/branch relative">
                            <button
                                onClick={() => removeBranch(branch.id)}
                                className="absolute top-4 right-4 p-2 opacity-0 group-hover/branch:opacity-100 hover:bg-red-500/10 rounded-xl text-red-500 transition-all"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                                    </div>
                                    <input
                                        value={branch.label}
                                        onChange={(e) => updateBranch(branch.id, 'label', e.target.value.toUpperCase())}
                                        className="bg-transparent border-none text-[11px] font-black text-slate-200 focus:outline-none tracking-widest w-full uppercase"
                                        placeholder="BRANCH NAME"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-700 uppercase tracking-widest pl-1">Branch Case Condition</label>
                                    <textarea
                                        value={branch.condition}
                                        onChange={(e) => updateBranch(branch.id, 'condition', e.target.value)}
                                        placeholder="e.g. When patient heart rate exceeds 120bpm..."
                                        className="w-full h-24 bg-black border border-white/5 rounded-xl p-4 text-[12px] font-mono text-amber-500/90 shadow-inner focus:border-amber-500/30 outline-none resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={addBranch}
                        className="w-full py-5 border border-dashed border-white/10 rounded-3xl text-[10px] font-black text-slate-500 hover:text-amber-400 hover:border-amber-400/50 transition-all uppercase tracking-[0.3em] bg-white/[0.01]"
                    >
                        + Add New Logical Case
                    </button>
                </div>
            </InspectorSection>

            {/* 3. Logic Synthesis Info */}
            <div className="pt-6 border-t border-white/5 opacity-50">
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Compiler Stability: 100% Verified</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ApprovalSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-8 flex flex-col h-full">
        <InspectorSection icon={Shield} title="Human Oversight Protocol" defaultOpen={true} accentColor="text-blue-500">
            <div className="space-y-4 pt-4">
                <div className="p-6 rounded-[2rem] bg-blue-500/5 border border-blue-500/20 group hover:bg-blue-500/10 transition-all">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-blue-500/10">
                                <Bell className="w-6 h-6 text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[13px] font-black text-slate-200 uppercase tracking-widest">Medical Alert (SMS)</span>
                                <span className="text-[9px] text-slate-600 uppercase font-black tracking-widest">Urgent Vetting Required</span>
                            </div>
                        </div>
                        <div className="w-12 h-6 bg-black rounded-full border border-white/10 p-1 relative cursor-pointer ring-1 ring-blue-500/20">
                            <div className="absolute right-1 top-1 w-4 h-4 rounded-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)]" />
                        </div>
                    </div>
                </div>

                <div className="p-6 rounded-[2rem] bg-black/40 border border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Escalation Timer</span>
                        <span className="text-[11px] font-mono text-blue-400">15:00m</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 w-1/3 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                    </div>
                </div>
            </div>
        </InspectorSection>

        <div className="space-y-4">
            <div className="flex items-center gap-3 px-1">
                <User className="w-4 h-4 text-blue-500" />
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Oversight Context</label>
            </div>
            <textarea
                value={node.data.context || ''}
                onChange={(e) => onUpdate({ context: e.target.value })}
                placeholder="Additional instructions for the human reviewer..."
                className="w-full h-48 bg-black/60 border border-white/10 rounded-[2.5rem] p-8 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-blue-500/50 outline-none scrollbar-hide shadow-inner"
            />
        </div>
    </div>
);

const InputSuite = ({ node, onUpdate }: { node: any; onUpdate: (data: any) => void }) => (
    <div className="px-10 pb-10 space-y-8 flex flex-col h-full">
        <InspectorSection icon={Database} title="Patient Vault Integration" defaultOpen={true} accentColor="text-emerald-500">
            <div className="space-y-4 pt-4">
                <div className="relative group/vault">
                    <select className="w-full bg-black/60 border border-white/10 rounded-2xl px-6 py-4 text-sm text-white appearance-none cursor-pointer focus:ring-1 focus:ring-emerald-500/50 font-black tracking-wider uppercase">
                        <option>Surgical Trace Vault #409</option>
                        <option>Clinical Baseline v2</option>
                        <option>Synthetic Adversarial Set</option>
                    </select>
                    <ChevronDown className="absolute right-6 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-hover/vault:text-emerald-500 transition-colors pointer-events-none" />
                </div>
                <button className="w-full py-5 rounded-[2rem] bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-black uppercase tracking-[0.3em] hover:bg-emerald-500/20 transition-all shadow-lg shadow-emerald-500/5 active:scale-95">
                    Sync Vault Repository
                </button>
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
                placeholder="Enter raw surgical data or patient history for evaluation..."
                className="w-full h-80 bg-black/60 border border-white/10 rounded-[2.5rem] p-10 text-sm text-slate-300 leading-relaxed font-mono resize-none focus:ring-1 focus:ring-emerald-500/50 outline-none scrollbar-hide shadow-2xl"
            />
        </div>

        <InspectorSection icon={FileText} title="Diagnostic Attachments" defaultOpen={false} accentColor="text-emerald-400">
            <div className="pt-4">
                <div className="border-2 border-dashed border-white/5 rounded-[2rem] p-12 flex flex-col items-center justify-center gap-4 hover:border-emerald-500/30 transition-all cursor-pointer bg-white/[0.01]">
                    <div className="p-4 rounded-full bg-emerald-500/5">
                        <FileText className="w-6 h-6 text-emerald-500/50" />
                    </div>
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Drop DICOM or PDF Labs</span>
                </div>
            </div>
        </InspectorSection>
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
