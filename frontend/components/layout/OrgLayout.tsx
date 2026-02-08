// Layout - OrgLayout
import React from 'react';

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

const OrgLayout: React.FC<OrgLayoutProps> = ({ breadcrumb, tabs, children }) => {
    return (
        <div className="min-h-screen bg-[#0d0d12]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {breadcrumb && (
                    <nav className="mb-4 text-sm text-slate-400">
                        {breadcrumb.map((item, index) => (
                            <span key={index}>
                                {index > 0 && <span className="mx-2">/</span>}
                                {item.href ? (
                                    <a href={item.href} className="hover:text-white">{item.label}</a>
                                ) : (
                                    <span className="text-white">{item.label}</span>
                                )}
                            </span>
                        ))}
                    </nav>
                )}
                {tabs && tabs.length > 0 && (
                    <div className="border-b border-white/10 mb-6">
                        <nav className="flex gap-1">
                            {tabs.map((tab) => (
                                <a
                                    key={tab.id}
                                    href={tab.href}
                                    className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white border-b-2 border-transparent hover:border-slate-600"
                                >
                                    {tab.label}
                                </a>
                            ))}
                        </nav>
                    </div>
                )}
                {children}
            </div>
        </div>
    );
};

export default OrgLayout;
