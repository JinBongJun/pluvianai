import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
    Settings,
    ShieldCheck,
    Key,
    Activity,
    BookOpen,
    Beaker,
    LayoutDashboard,
    ChevronRight
} from 'lucide-react';
import { clsx } from 'clsx';
import TopHeader from './TopHeader';
import { authAPI } from '@/lib/api';

interface Breadcrumb {
    label: string;
    href?: string;
}

interface Tab {
    id: string;
    label: string;
    href: string;
}

interface OrgLayoutProps {
    orgId?: string | number;
    breadcrumb?: Breadcrumb[];
    tabs?: Tab[];
    children: React.ReactNode;
}

const OrgLayout: React.FC<OrgLayoutProps> = ({ orgId, breadcrumb, tabs, children }) => {
    const params = useParams();
    const pathname = usePathname();
    const router = useRouter();
    const resolvedOrgId = orgId || params.orgId;

    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    useEffect(() => {
        const loadUser = async () => {
            try {
                const user = await authAPI.getCurrentUser();
                setUserName(user.full_name || '');
                setUserEmail(user.email || '');
            } catch (error) {
                console.error('Failed to load user info in OrgLayout:', error);
            }
        };
        loadUser();
    }, []);

    const navItems = [
        {
            label: 'Clinical Settings',
            desc: 'Laboratory environment',
            href: `/organizations/${resolvedOrgId}/settings`,
            icon: Settings
        },
        {
            label: 'Laboratory Protocols',
            desc: 'Organization & Team permissions',
            href: `/organizations/${resolvedOrgId}/team`,
            icon: ShieldCheck
        },
        {
            label: 'Usage & Licensing',
            desc: 'Clinical activity & Billing',
            href: `/organizations/${resolvedOrgId}/billing`,
            icon: Activity
        },
        {
            label: 'Clinical Documentation',
            desc: 'Laboratory guides & API',
            href: '/docs',
            icon: BookOpen
        },
    ];

    return (
        <div className="min-h-screen flex bg-transparent">
            <TopHeader
                userName={userName}
                userEmail={userEmail}
            />
            {/* Scientific Sidebar */}
            <aside className="fixed top-[90px] left-0 w-80 h-[calc(100vh-90px)] border-r border-white/5 bg-[#0a0a0c]/40 backdrop-blur-3xl z-40 overflow-hidden">
                {/* Animated Background Pattern */}
                <div className="absolute inset-0 bg-flowing-lines opacity-[0.05] pointer-events-none" />

                <div className="relative z-10 p-6 flex flex-col h-full">
                    <div className="mb-10">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] mb-4">
                            Scientific Context
                        </div>
                        <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-tight">Laboratory Ops</h2>
                    </div>

                    <nav className="flex-1 space-y-3">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname === item.href || (item.href !== '/docs' && pathname.startsWith(item.href));

                            return (
                                <button
                                    key={item.href}
                                    onClick={() => router.push(item.href)}
                                    className={clsx(
                                        "w-full flex items-center gap-5 p-4 rounded-2xl transition-all group border border-transparent",
                                        isActive
                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                            : "hover:bg-white/5 text-slate-500 hover:text-white"
                                    )}
                                >
                                    <div className={clsx(
                                        "w-12 h-12 rounded-xl flex items-center justify-center transition-all flex-shrink-0",
                                        isActive ? "bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.5)]" : "bg-white/5 group-hover:bg-white/10"
                                    )}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className="text-base font-black uppercase tracking-wider">{item.label}</p>
                                        <p className="text-[11px] font-bold opacity-60 uppercase tracking-tight truncate w-40">{item.desc}</p>
                                    </div>
                                    {isActive && <ChevronRight className="w-5 h-5 text-emerald-400" />}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="mt-auto pt-6 border-t border-white/5">
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Protocol Version v1.0</span>
                            </div>
                            <p className="text-[9px] text-slate-600 font-bold uppercase leading-relaxed">
                                All clinical actions are logged under laboratory compliance protocols.
                            </p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 ml-80 pt-[90px]">
                <div className="max-w-[1400px] mx-auto p-12">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default OrgLayout;
