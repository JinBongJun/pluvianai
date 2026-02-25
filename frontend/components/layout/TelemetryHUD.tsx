'use client';

import React from 'react';
import { Activity, Zap, ShieldCheck, Database } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export interface TelemetryStat {
    label: string;
    value: string;
    icon: any;
    color: string;
    glow: string;
}

interface TelemetryHUDProps {
    stats?: TelemetryStat[];
    customActions?: { id: string; label: string; icon: any }[];
    onAction?: (actionId: string) => void;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({ stats: propStats, customActions, onAction }) => {
    const defaultStats = [
        { label: 'Active Neural Agents', value: '0', icon: Activity, color: 'text-emerald-400', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' },
        { label: 'Avg System Latency', value: '0ms', icon: Zap, color: 'text-cyan-400', glow: 'shadow-[0_0_20px_rgba(34,211,238,0.2)]' },
        { label: 'Safety Success Rate', value: '100%', icon: ShieldCheck, color: 'text-emerald-500', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' },
        { label: 'Security Snapshots', value: '0', icon: Database, color: 'text-slate-400', glow: 'shadow-[0_0_20px_rgba(148,163,184,0.1)]' },
    ];

    const stats = propStats || defaultStats;

    return (
        <div className="w-full bg-[#0d0d0f]/60 backdrop-blur-3xl border-b border-white/10 px-12 py-5 flex items-center justify-center gap-16 z-40">
            {stats.map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-5 group"
                >
                    <div className={clsx(
                        "p-2.5 rounded-xl bg-white/5 border border-white/10 transition-all group-hover:scale-110",
                        stat.color,
                        stat.glow
                    )}>
                        <stat.icon className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] leading-none mb-2">{stat.label}</span>
                        <div className="flex items-baseline gap-2.5">
                            <span className="text-xl font-black text-white leading-none tracking-tighter tabular-nums">{stat.value}</span>
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 animate-pulse" />
                        </div>
                    </div>

                    {/* Visual Separator */}
                    {i < stats.length - 1 && (
                        <div className="ml-16 w-[1px] h-6 bg-white/10" />
                    )}
                </motion.div>
            ))}

            {/* Custom Actions (Calibrate, etc.) */}
            {customActions && customActions.length > 0 && (
                <div className="flex items-center gap-3 ml-8 pl-8 border-l border-white/10">
                    {customActions.map((action) => (
                        <button
                            key={action.id}
                            onClick={() => onAction?.(action.id)}
                            className="flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30 transition-all duration-300 group"
                        >
                            <action.icon className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            <span className="text-[11px] font-black uppercase tracking-widest">{action.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
