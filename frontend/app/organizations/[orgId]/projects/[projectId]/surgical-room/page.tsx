'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Activity, Info } from 'lucide-react';

export default function SurgicalRoomPage() {
    return (
        <div className="flex flex-col h-full w-full bg-[#0a0a0c] overflow-hidden">
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center text-center max-w-md"
                >
                    <div className="p-4 rounded-full bg-amber-500/10 border border-amber-500/20 mb-6 relative">
                        <Zap className="w-12 h-12 text-amber-500" />
                        <motion.div
                            animate={{ opacity: [0.3, 0.6, 0.3] }}
                            transition={{ duration: 2, repeat: Infinity }}
                            className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl"
                        />
                    </div>

                    <h1 className="text-2xl font-bold text-white mb-2 tracking-tight">
                        Surgical Room <span className="text-amber-500">Diagnosis</span>
                    </h1>
                    <p className="text-slate-500 text-sm mb-8 leading-relaxed">
                        This area is currently being sterilized for active clinical diagnosis.
                        Soon, you'll be able to extract production traces here for automated repair.
                    </p>

                    <div className="grid grid-cols-1 gap-4 w-full">
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-900/50 border border-slate-800 text-left">
                            <Activity className="w-5 h-5 text-amber-500/70" />
                            <div>
                                <div className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Next Step</div>
                                <div className="text-[13px] text-slate-400">Automated Trace-to-Node Extraction</div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Clinical Background Grid Accent */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-20">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(245, 158, 11, 0.15) 1px, transparent 0)',
                        backgroundSize: '48px 48px'
                    }}
                />
            </div>
        </div>
    );
}

