// Layout - TopHeader
import React from 'react';

interface TopHeaderProps {
    breadcrumb?: { label: string; href?: string }[];
    showSearch?: boolean;
    onSearchClick?: () => void;
    userEmail?: string;
    userName?: string;
    userPlan?: string;
    onLogout?: () => void;
    rightContent?: React.ReactNode;
}

const TopHeader: React.FC<TopHeaderProps> = ({
    breadcrumb,
    showSearch,
    onSearchClick,
    userEmail,
    userName,
    userPlan,
    onLogout,
    rightContent
}) => {
    return (
        <header className="bg-[#1a1a1e] border-b border-white/10 px-6 py-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold text-white">AgentGuard</h1>
                    {breadcrumb && (
                        <nav className="flex items-center gap-2 text-sm text-slate-400">
                            {breadcrumb.map((item, index) => (
                                <React.Fragment key={index}>
                                    <span>/</span>
                                    {item.href ? (
                                        <a href={item.href} className="hover:text-white">{item.label}</a>
                                    ) : (
                                        <span className="text-white">{item.label}</span>
                                    )}
                                </React.Fragment>
                            ))}
                        </nav>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    {rightContent}
                    {/* Placeholder for user menu */}
                </div>
            </div>
        </header>
    );
};

export default TopHeader;
