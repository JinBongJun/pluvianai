import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { BarChart2, Zap, AlertTriangle, DollarSign, TrendingUp, Shield, Eye, Beaker } from 'lucide-react';

interface ProjectTabsProps {
    projectId: number;
    orgId: string;
    basePath?: string;
    canManage?: boolean;
    worstAlertCounts?: {
        liveView: number;
        testLab: number;
    };
}

const ProjectTabs: React.FC<ProjectTabsProps> = ({ projectId, orgId, basePath, canManage, worstAlertCounts }) => {
    const pathname = usePathname();

    const tabs = [
        { name: 'API Calls', href: `/organizations/${orgId}/projects/${projectId}/api-calls`, icon: BarChart2 },
        { name: 'Live View', href: `/organizations/${orgId}/projects/${projectId}/live-view`, icon: Eye },
        { name: 'Test Lab', href: `/organizations/${orgId}/projects/${projectId}/test-lab`, icon: Beaker },
        { name: 'Signals', href: `/organizations/${orgId}/projects/${projectId}/signals`, icon: Zap },
        { name: 'Alerts', href: `/organizations/${orgId}/projects/${projectId}/alerts`, icon: AlertTriangle },
        { name: 'Quality', href: `/organizations/${orgId}/projects/${projectId}/quality`, icon: TrendingUp },
        { name: 'Cost', href: `/organizations/${orgId}/projects/${projectId}/cost`, icon: DollarSign },
        { name: 'Firewall', href: `/organizations/${orgId}/projects/${projectId}/firewall`, icon: Shield },
    ];

    return (
        <div className="border-b border-white/10 mb-6">
            <nav className="flex gap-1 overflow-x-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = pathname === tab.href;

                    return (
                        <Link
                            key={tab.name}
                            href={tab.href}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                                isActive
                                    ? 'border-emerald-500 text-emerald-400'
                                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-600'
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.name}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
};

export default ProjectTabs;
