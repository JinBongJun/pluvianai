// Search - GlobalSearch
import React from 'react';
import { Search } from 'lucide-react';

interface GlobalSearchProps {
    isOpen: boolean;
    onClose: () => void;
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-2xl bg-[#1a1a1e] border border-white/10 rounded-xl shadow-2xl p-4" onClick={e => e.stopPropagation()}>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search projects, logs, settings..."
                        className="w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                </div>
            </div>
        </div>
    );
};

export default GlobalSearch;
