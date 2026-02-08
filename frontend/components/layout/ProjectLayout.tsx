// Layout - ProjectLayout
import React from 'react';

interface Breadcrumb {
    label: string;
    href?: string;
}

export interface ProjectLayoutProps {
    orgId: string;
    projectId: number;
    basePath?: string;
    breadcrumb?: Breadcrumb[];
    tabs?: any[];
    children: React.ReactNode;
}

const ProjectLayout: React.FC<ProjectLayoutProps> = ({
    orgId,
    projectId,
    basePath,
    breadcrumb,
    tabs,
    children
}) => {
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
                {children}
            </div>
        </div>
    );
};

export default ProjectLayout;
