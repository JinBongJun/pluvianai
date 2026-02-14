'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

export interface InspectorSectionProps {
    icon: any;
    title: string;
    badge?: string | number;
    children: React.ReactNode;
    defaultOpen?: boolean;
    accentColor?: string;
}

export const InspectorSection: React.FC<InspectorSectionProps> = ({
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
