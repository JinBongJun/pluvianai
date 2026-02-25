'use client';

import React from 'react';
import { motion } from 'framer-motion';

const signals = [
    { code: 'Hal', name: 'Hallucination', num: '01', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/5' },
    { code: 'Pii', name: 'PII Leak', num: '02', color: 'border-red-500/50 text-red-400 bg-red-500/5' },
    { code: 'Tox', name: 'Toxicity', num: '03', color: 'border-orange-500/50 text-orange-400 bg-orange-500/5' },
    { code: 'Drt', name: 'Drift', num: '04', color: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/5' },
    { code: 'Sch', name: 'Schema', num: '05', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/5' },
    { code: 'Lat', name: 'Latency', num: '06', color: 'border-slate-500/50 text-slate-400 bg-slate-500/5' },
    { code: 'Cos', name: 'Cost Spike', num: '07', color: 'border-slate-500/50 text-slate-400 bg-slate-500/5' },
    { code: 'Bias', name: 'Bias', num: '08', color: 'border-orange-500/50 text-orange-400 bg-orange-500/5' },
    { code: 'Sec', name: 'Injection', num: '09', color: 'border-red-500/50 text-red-400 bg-red-500/5' },
    { code: 'Rec', name: 'Recall', num: '10', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/5' },
    { code: 'Pre', name: 'Precision', num: '11', color: 'border-cyan-500/50 text-cyan-400 bg-cyan-500/5' },
    { code: 'Ton', name: 'Tone', num: '12', color: 'border-yellow-500/50 text-yellow-400 bg-yellow-500/5' },
    { code: 'Sen', name: 'Sentiment', num: '13', color: 'border-emerald-500/50 text-emerald-400 bg-emerald-500/5' },
];

export default function AtomicSignalsSection() {
    return (
        <section id="features" className="py-32 bg-transparent relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/10 via-black/40 to-black/80 pointer-events-none" />

            <div className="container mx-auto px-6 relative z-10 text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-6 border border-cyan-500/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                    Atomic Lab
                </div>
                <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                    The Lab&apos;s core telemetry infrastructure.
                </h2>
                <p className="text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto mb-20">
                    We don&apos;t just guess. We measure 13 fundamental elements of agent quality with clinical precision.
                </p>

                <div className="flex flex-wrap justify-center gap-4 max-w-5xl mx-auto">
                    {signals.map((sig) => (
                        <motion.div
                            key={sig.code}
                            whileHover={{ scale: 1.05, y: -5 }}
                            className={`relative w-32 h-32 md:w-36 md:h-36 rounded-xl border-2 ${sig.color} p-4 flex flex-col justify-between cursor-default backdrop-blur-sm transition-shadow hover:shadow-[0_0_30px_-5px_currentColor]`}
                        >
                            <div className="flex justify-between items-start text-[10px] font-mono opacity-70">
                                <span>{sig.num}</span>
                                <span>1.008</span>
                            </div>
                            <div className="text-center">
                                <span className="text-3xl font-bold tracking-tighter">{sig.code}</span>
                            </div>
                            <div className="text-center text-[10px] font-bold uppercase tracking-wider opacity-80 truncate px-1">
                                {sig.name}
                            </div>
                        </motion.div>
                    ))}

                    {/* Empty slots for visual balance if needed, or "Custom" */}
                    <motion.div
                        whileHover={{ scale: 1.05, y: -5 }}
                        className="relative w-32 h-32 md:w-36 md:h-36 rounded-xl border-2 border-slate-700/50 bg-slate-800/20 p-4 flex flex-col justify-between cursor-pointer border-dashed hover:border-white/50 text-slate-500 hover:text-white transition-colors"
                    >
                        <div className="flex justify-between items-start text-[10px] font-mono opacity-50">
                            <span>14</span>
                            <span>...</span>
                        </div>
                        <div className="text-center self-center mt-2">
                            <span className="text-4xl font-thin">+</span>
                        </div>
                        <div className="text-center text-[10px] font-bold uppercase tracking-wider opacity-60">
                            Custom
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
