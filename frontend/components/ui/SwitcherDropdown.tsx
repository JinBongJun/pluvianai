'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, Plus, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import Link from 'next/link';

interface SwitcherItem {
    id: string | number;
    name: string;
    href: string;
    badge?: string;
}

interface SwitcherDropdownProps {
    label: string;
    items: SwitcherItem[];
    activeId?: string | number;
    placeholder?: string;
    footerItems?: { label: string; href: string; icon?: any }[];
    badge?: string;
    icon?: any;
    className?: string;
}

const SwitcherDropdown: React.FC<SwitcherDropdownProps> = ({
    label,
    items,
    activeId,
    placeholder = "Search...",
    footerItems,
    badge,
    icon: Icon,
    className
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase())
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={clsx("relative", className)} ref={containerRef}>
            {/* Trigger */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 transition-all group"
            >
                {Icon && <Icon className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />}
                <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white uppercase tracking-tight">{label}</span>
                    {badge && (
                        <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black text-slate-500 tracking-tighter uppercase whitespace-nowrap">
                            {badge}
                        </span>
                    )}
                </div>
                <ChevronDown className={clsx("w-4 h-4 text-slate-600 group-hover:text-white transition-all duration-300", isOpen && "rotate-180 text-emerald-400")} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="absolute top-full left-0 mt-2 w-72 bg-[#0a0a0c]/90 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-[1000]"
                    >
                        {/* Search Area */}
                        <div className="p-3 border-b border-white/5">
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-emerald-500 transition-colors" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-10 pr-4 text-xs font-bold text-white placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Items List */}
                        <div className="max-h-64 overflow-y-auto p-1.5 custom-scrollbar">
                            {filteredItems.length > 0 ? (
                                filteredItems.map((item) => (
                                    <Link
                                        key={item.id}
                                        href={item.href}
                                        onClick={() => setIsOpen(false)}
                                        className={clsx(
                                            "flex items-center justify-between p-3 rounded-xl transition-all group/item",
                                            activeId === item.id
                                                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                                : "hover:bg-white/5 text-slate-400 hover:text-white border border-transparent"
                                        )}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <span className="text-sm font-black uppercase tracking-tight truncate">{item.name}</span>
                                            {item.badge && (
                                                <span className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[8px] font-black text-slate-600 uppercase tracking-tighter">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </div>
                                        {activeId === item.id && <Check className="w-4 h-4 flex-shrink-0" />}
                                    </Link>
                                ))
                            ) : (
                                <div className="p-8 text-center">
                                    <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">No entries found</p>
                                </div>
                            )}
                        </div>

                        {/* Footer Items */}
                        {footerItems && footerItems.length > 0 && (
                            <div className="p-1.5 bg-white/[0.02] border-t border-white/5">
                                {footerItems.map((footer, idx) => {
                                    const FooterIcon = footer.icon || Plus;
                                    return (
                                        <Link
                                            key={idx}
                                            href={footer.href}
                                            onClick={() => setIsOpen(false)}
                                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all group/footer text-slate-500 hover:text-white"
                                        >
                                            <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center group-hover/footer:bg-emerald-500 group-hover/footer:text-black transition-all">
                                                <FooterIcon className="w-3.5 h-3.5" />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-[0.1em]">{footer.label}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SwitcherDropdown;
