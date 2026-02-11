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
        { name: 'Architecture', href: `/organizations/${orgId}/projects/${projectId}/live-view` },
        { name: 'Test Lab', href: `/organizations/${orgId}/projects/${projectId}/test-lab` },
    ];

    return (
        <nav className="flex items-center gap-6 px-4">
            {navItems.map((item) => {
                const isActive = pathname === item.href;

                return (
                    <Link
                        key={item.name}
                        href={item.href}
                        className={clsx(
                            'relative py-2 text-[13px] font-medium transition-colors duration-200',
                            isActive ? 'text-white' : 'text-slate-500 hover:text-slate-300'
                        )}
                    >
                        {item.name}
                        {isActive && (
                            <motion.div
                                layoutId="active-tab-line"
                                className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500"
                                transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                            />
                        )}
                    </Link>
                );
            })}
        </nav>
    );
};
