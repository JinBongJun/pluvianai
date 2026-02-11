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
    MessageSquare
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';

interface InspectorSectionProps {
    icon: any;
    title: string;
    badge?: string | number;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const InspectorSection: React.FC<InspectorSectionProps> = ({ icon: Icon, title, badge, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border-b border-white/5">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors group"
            >
                <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-500 group-hover:text-slate-300 transition-colors" />
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    {badge !== undefined && (
                        <span className="px-1.5 py-0.5 rounded-md bg-white/5 text-[9px] font-bold text-slate-500">{badge}</span>
                    )}
                    <ChevronDown className={clsx("w-4 h-4 text-slate-700 transition-transform duration-300", isOpen && "rotate-180")} />
                </div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0">
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export interface TestLabInspectorProps {
    node: any;
    onUpdate: (data: any) => void;
}

export const TestLabInspector: React.FC<TestLabInspectorProps> = ({ node, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'details' | 'results'>('details');

    const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onUpdate({ model: e.target.value });
    };

    const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onUpdate({ systemPrompt: e.target.value });
    };

    return (
        <div className="flex flex-col h-full bg-[#121214] text-slate-200">
            {/* Inspector Tabs */}
            <div className="flex border-b border-white/5 bg-black/20">
                <button
                    onClick={() => setActiveTab('details')}
                    className={clsx(
                        "flex-1 py-3 text-[11px] font-bold uppercase tracking-widest transition-all relative",
                        activeTab === 'details' ? "text-white" : "text-slate-600 hover:text-slate-400"
                    )}
                >
                    Details
                    {activeTab === 'details' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#8b5cf6]" />}
                </button>
                <button
                    onClick={() => setActiveTab('results')}
                    className={clsx(
                        "flex-1 py-3 text-[11px] font-bold uppercase tracking-widest transition-all relative",
                        activeTab === 'results' ? "text-white" : "text-slate-600 hover:text-slate-400"
                    )}
                >
                    Results
                    {activeTab === 'results' && <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#8b5cf6]" />}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
                {/* Agent Identity Section */}
                <div className="p-6 pb-4">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-2 h-2 rounded-full bg-[#8b5cf6] shadow-[0_0_8px_rgba(139,92,246,0.6)]" />
                        <h2 className="text-xl font-bold text-white tracking-tight">{node.data.label}</h2>
                    </div>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-2 gap-3 mb-8">
                        <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[11px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                            <Play className="w-3 h-3 fill-current" />
                            Test Agent
                        </button>
                        <button className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#8b5cf6]/10 border border-[#8b5cf6]/20 text-[#8b5cf6] text-[11px] font-black uppercase tracking-widest hover:bg-[#8b5cf6]/20 transition-all shadow-[0_0_20px_rgba(139,92,246,0.1)]">
                            <Zap className="w-3 h-3 fill-current" />
                            Run Chain
                        </button>
                    </div>

                    {/* High-Level Configuration Overlay Style */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-2">
                                <Settings className="w-3.5 h-3.5 text-slate-600" />
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Configuration</span>
                            </div>
                            <ChevronDown className="w-4 h-4 text-slate-800" />
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 px-1">Model</label>
                                <div className="relative group">
                                    <select
                                        value={node.data.model || 'gpt-4o (Recommended)'}
                                        onChange={handleModelChange}
                                        className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white appearance-none focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]/50 transition-all cursor-pointer"
                                    >
                                        <option value="gpt-4o (Recommended)">gpt-4o (Recommended)</option>
                                        <option value="claude-3-5-sonnet-latest">claude-3-5-sonnet-latest</option>
                                        <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none group-hover:text-slate-400" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-2 px-1">System Prompt</label>
                                <textarea
                                    value={node.data.systemPrompt || ''}
                                    onChange={handlePromptChange}
                                    placeholder="Define the agent's role and behavior..."
                                    className="w-full h-48 bg-white/[0.03] border border-white/5 rounded-xl p-4 text-xs text-white leading-relaxed placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#8b5cf6]/50 transition-all resize-none font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Collapsible Sections */}
                <div className="mt-4 border-t border-white/5">
                    <InspectorSection icon={Database} title="Test Data" badge="0 Loaded">
                        <div className="text-[10px] text-slate-700 italic">No datasets connected to this specimen.</div>
                    </InspectorSection>
                    <InspectorSection icon={Zap} title="Signals & Thresholds" badge="5 Active">
                        <div className="space-y-2">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="flex items-center justify-between text-[10px] py-1 border-b border-white/[0.02]">
                                    <span className="text-slate-500">Signal_{i}</span>
                                    <span className="text-emerald-500 font-bold">READY</span>
                                </div>
                            ))}
                        </div>
                    </InspectorSection>
                    <InspectorSection icon={GitBranch} title="Connections" badge={0}>
                        <div className="text-[10px] text-slate-700">No active neural links detected.</div>
                    </InspectorSection>
                </div>
            </div>
        </div>
    );
};
