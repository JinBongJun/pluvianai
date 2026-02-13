'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Activity, Map, Beaker, Zap, History, Key } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface LaboratoryNavbarProps {
    orgId: string;
    projectId: number;
}

export const LaboratoryNavbar: React.FC<LaboratoryNavbarProps> = ({ orgId, projectId }) => {
    const pathname = usePathname();

    const navItems = [
        {
            name: 'Live View',
            href: `/organizations/${orgId}/projects/${projectId}/live-view`,
            icon: Activity,
            color: 'violet'
        },
        {
            name: 'Surgical Room',
            href: `/organizations/${orgId}/projects/${projectId}/surgical-room`,
            icon: Zap,
            color: 'amber'
        },
        {
            name: 'Test Lab',
            href: `/organizations/${orgId}/projects/${projectId}/test-lab`,
            icon: Beaker,
            color: 'emerald'
        },
    ];

    return (
        <nav className="flex items-center gap-1.5 h-full">
            {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                const colorMap: Record<string, { active: string; bg: string; icon: string; border: string }> = {
                    violet: { active: 'text-violet-400', bg: 'bg-violet-500/10', icon: 'text-violet-500', border: 'border-violet-500/20' },
                    amber: { active: 'text-amber-400', bg: 'bg-amber-500/10', icon: 'text-amber-500', border: 'border-amber-500/20' },
                    emerald: { active: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: 'text-emerald-500', border: 'border-emerald-500/20' }
                };

                const theme = colorMap[item.color] || colorMap.emerald;

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        className={clsx(
                            'group flex items-center gap-2.5 px-4 py-1.5 rounded-lg transition-all duration-200 border',
                            isActive
                                ? `${theme.bg} ${theme.active} ${theme.border} shadow-[0_0_15px_rgba(0,0,0,0.2)]`
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'
                        )}
                    >
                        <Icon className={clsx(
                            'w-4 h-4 transition-colors',
                            isActive ? theme.active : `${theme.icon} opacity-50`
                        )} />
                        <span className={clsx(
                            "text-[12px] font-bold tracking-tight",
                            isActive ? "opacity-100" : "opacity-70"
                        )}>
                            {item.name}
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
};
