'use client';

import React from 'react';
import { Cpu, Binary, GitBranch, Zap, Trash2, ChevronDown, ShieldCheck } from 'lucide-react';
import { InspectorSection } from './InspectorSection';

export interface RouterSuiteProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const RouterSuite: React.FC<RouterSuiteProps> = ({ node, onUpdate }) => {
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
