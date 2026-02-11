'use client';

import React from 'react';
import { Activity, Zap, ShieldCheck, Database } from 'lucide-react';
import { motion } from 'framer-motion';

export const TelemetryHUD: React.FC = () => {
    const stats = [
        { label: 'Active Agents', value: '12', icon: Activity, color: 'text-emerald-400', glow: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]' },
        { label: 'Avg Latency', value: '420ms', icon: Zap, color: 'text-cyan-400', glow: 'shadow-[0_0_10px_rgba(34,211,238,0.3)]' },
        { label: 'Success Rate', value: '98.2%', icon: ShieldCheck, color: 'text-emerald-500', glow: 'shadow-[0_0_10px_rgba(16,185,129,0.3)]' },
        { label: 'Snapshots', value: '1.2k', icon: Database, color: 'text-slate-400', glow: 'shadow-[0_0_10px_rgba(148,163,184,0.3)]' },
    ];

    return (
        <div className="w-full bg-[#0d0d0f]/50 backdrop-blur-3xl border-b border-white/5 px-8 py-3 flex items-center justify-center gap-12 z-40">
            {stats.map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3 group"
                >
                    <div className={`p-1.5 rounded-lg bg-white/5 border border-white/10 ${stat.color} ${stat.glow}`}>
                        <stat.icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-none mb-1">{stat.label}</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-white leading-none tracking-tight">{stat.value}</span>
                            <div className="w-1 h-1 rounded-full bg-emerald-500/40 animate-pulse" />
                        </div>
                    </div>

                    {/* Visual Separator */}
                    {i < stats.length - 1 && (
                        <div className="ml-12 w-[1px] h-4 bg-white/5" />
                    )}
                </motion.div>
            ))}
        </div>
    );
};
