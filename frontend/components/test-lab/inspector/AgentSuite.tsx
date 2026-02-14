'use client';

import React from 'react';
import { Sliders, Shield, Zap, Cpu, ChevronDown } from 'lucide-react';
import { InspectorSection } from './InspectorSection';

export interface AgentSuiteProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const AgentSuite: React.FC<AgentSuiteProps> = ({ node, onUpdate }) => {
    return (
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
};
