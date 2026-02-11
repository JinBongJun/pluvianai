'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Swords, Zap, Activity, ShieldCheck, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

interface MetricCardProps {
    label: string;
    liveValue: string;
    labValue: string;
    unit: string;
    better: 'live' | 'lab';
}

const MetricCard: React.FC<MetricCardProps> = ({ label, liveValue, labValue, unit, better }) => {
    return (
        <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-all group">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">{label}</div>
            <div className="grid grid-cols-2 gap-8 items-center">
                <div className="space-y-1">
                    <div className="text-[9px] font-bold text-slate-600 uppercase">Live Baseline</div>
                    <div className="text-2xl font-black text-slate-400 font-mono italic">{liveValue}{unit}</div>
                </div>
                <div className="space-y-1 border-l border-white/5 pl-8 relative">
                    <div className="text-[9px] font-bold text-violet-400 uppercase">Lab Experiment</div>
                    <div className={clsx(
                        "text-3xl font-black font-mono",
                        better === 'lab' ? "text-emerald-400 italic" : "text-red-400 italic"
                    )}>
                        {labValue}{unit}
                    </div>
                    <div className="absolute -right-2 top-0">
                        {better === 'lab' ? (
                            <TrendingUp className="w-4 h-4 text-emerald-500 animate-bounce" />
                        ) : (
                            <TrendingDown className="w-4 h-4 text-red-500 animate-bounce" />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export interface TestLabComparisonOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export const TestLabComparisonOverlay: React.FC<TestLabComparisonOverlayProps> = ({ isOpen, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-[#0a0a0c]/90 backdrop-blur-2xl">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="w-full max-w-6xl h-full max-h-[85vh] bg-[#121214] border border-white/10 rounded-[2.5rem] shadow-[0_0_100px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden relative"
                    >
                        {/* Header Area */}
                        <div className="p-8 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-violet-500/10 to-transparent">
                            <div className="flex items-center gap-6">
                                <div className="p-4 rounded-2xl bg-violet-600 shadow-[0_0_30px_rgba(139,92,246,0.4)]">
                                    <Swords className="w-8 h-8 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-3xl font-black text-white tracking-tighter uppercase italic">Battle [Live vs Lab]</h2>
                                    <p className="text-slate-500 text-sm font-bold tracking-wide uppercase mt-1">Experimental Performance Infiltration Analysis</p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-4 rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-all group"
                            >
                                <X className="w-8 h-8 group-hover:rotate-90 transition-transform" />
                            </button>
                        </div>

                        {/* Content Grid */}
                        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                <MetricCard
                                    label="Response Latency"
                                    liveValue="1.2"
                                    labValue="0.8"
                                    unit="s"
                                    better="lab"
                                />
                                <MetricCard
                                    label="Accuracy Score"
                                    liveValue="82"
                                    labValue="94"
                                    unit="%"
                                    better="lab"
                                />
                                <MetricCard
                                    label="Safety Alignment"
                                    liveValue="99"
                                    labValue="98"
                                    unit="%"
                                    better="live"
                                />
                                <MetricCard
                                    label="Token Efficiency"
                                    liveValue="450"
                                    labValue="380"
                                    unit=""
                                    better="lab"
                                />
                                <MetricCard
                                    label="Human Tone Match"
                                    liveValue="74"
                                    labValue="91"
                                    unit="%"
                                    better="lab"
                                />
                                <div className="bg-violet-600/10 border border-violet-500/20 rounded-2xl p-8 flex flex-col justify-center gap-4 relative overflow-hidden group">
                                    <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
                                        <TrendingUp className="w-48 h-48" />
                                    </div>
                                    <h3 className="text-xl font-black text-violet-400 italic">Overall Verdict</h3>
                                    <p className="text-4xl font-black text-white italic">+14.2%</p>
                                    <div className="px-4 py-2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest text-center self-start">
                                        Significant Improvement
                                    </div>
                                </div>
                            </div>

                            {/* Prompt Diff Simulator */}
                            <div className="mt-12 space-y-6">
                                <h3 className="text-[12px] font-black text-slate-500 uppercase tracking-widest px-1">Prompt Evolution Matrix</h3>
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="bg-black/40 rounded-3xl border border-white/5 p-8">
                                        <div className="text-[10px] font-bold text-slate-600 uppercase mb-4">Original Live Instructions</div>
                                        <div className="text-xs text-slate-400 font-mono leading-relaxed italic opacity-60">
                                            "You are a helpful assistant that answers questions clearly. Avoid being too technical."
                                        </div>
                                    </div>
                                    <div className="bg-violet-600/5 rounded-3xl border border-violet-500/20 p-8 shadow-[inset_0_0_40px_rgba(139,92,246,0.1)]">
                                        <div className="text-[10px] font-bold text-violet-400 uppercase mb-4">Lab Optimized Specimen</div>
                                        <div className="text-xs text-white font-mono leading-relaxed italic">
                                            "You are a highly efficient clinical intelligence module. <span className="text-emerald-400 underline underline-offset-4 font-black">Synthesize complex data into actionable insights</span> while maintaining surgical precision in your tone."
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer / Actions */}
                        <div className="p-8 border-t border-white/10 bg-black/20 flex items-center justify-between">
                            <div className="flex gap-4">
                                <div className="flex -space-x-3">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="w-10 h-10 rounded-full border-2 border-[#121214] bg-slate-800" />
                                    ))}
                                </div>
                                <div className="text-xs text-slate-500 font-bold self-center">3 Clinical Experts Reviewed This Deployment</div>
                            </div>
                            <div className="flex gap-4">
                                <button className="px-8 py-4 rounded-2xl bg-white/5 text-white text-[12px] font-black uppercase tracking-widest hover:bg-white/10 transition-all border border-white/10">Discard Experiment</button>
                                <button className="px-10 py-4 rounded-2xl bg-violet-600 text-white text-[12px] font-black uppercase tracking-widest hover:bg-violet-500 transition-all shadow-[0_0_30px_rgba(139,92,246,0.3)]">Deploy to Live Stage</button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
