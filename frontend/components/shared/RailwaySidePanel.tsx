// Shared components - RailwaySidePanel
import React from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface Tab {
    id: string;
    label: string;
    onClick?: () => void;
}

interface RailwaySidePanelProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    tabs?: Tab[];
    activeTab?: string;
    onTabChange?: (tabId: string) => void;
    children: React.ReactNode;
    className?: string;
    headerActions?: React.ReactNode;
}

const RailwaySidePanel: React.FC<RailwaySidePanelProps> = ({
    title,
    isOpen,
    onClose,
    tabs,
    activeTab,
    onTabChange,
    children,
    className = '',
    headerActions,
}) => {
    return (
        <div
            className={clsx(
                'fixed top-0 right-0 h-full w-96 bg-[#1a1a1e] border-l border-white/10 shadow-2xl transform transition-transform duration-300 z-40',
                isOpen ? 'translate-x-0' : 'translate-x-full',
                className
            )}
        >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">{title}</h2>
                <button
                    onClick={onClose}
                    className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            {tabs && tabs.length > 0 && (
                <div className="border-b border-white/10 px-6">
                    <nav className="flex gap-1">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    tab.onClick?.();
                                    onTabChange?.(tab.id);
                                }}
                                className={clsx(
                                    'px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                                    activeTab === tab.id
                                        ? 'text-emerald-400 border-emerald-500'
                                        : 'text-slate-400 hover:text-white border-transparent hover:border-emerald-500'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </div>
            )}
            <div className="overflow-y-auto h-[calc(100%-4rem)] p-6">
                {children}
            </div>
        </div>
    );
};

export default RailwaySidePanel;
