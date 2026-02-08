// Placeholder for FilterPanel - creating minimal implementation
import React from 'react';

export interface FilterState {
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    provider?: string;
    model?: string;
    agentName?: string;
    search?: string;
}

interface FilterPanelProps {
    filters: FilterState;
    onFiltersChange: (filters: FilterState) => void;
    onReset: () => void;
    availableProviders?: string[];
    availableModels?: string[];
    availableAgents?: string[];
}

const FilterPanel: React.FC<FilterPanelProps> = ({
    filters,
    onFiltersChange,
    onReset,
    availableProviders = [],
    availableModels = [],
    availableAgents = [],
}) => {
    return (
        <div className="bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-white">Filters</h3>
                <button
                    onClick={onReset}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                >
                    Reset
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Provider Filter */}
                {availableProviders.length > 0 && (
                    <select
                        value={filters.provider || ''}
                        onChange={(e) => onFiltersChange({ ...filters, provider: e.target.value || undefined })}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                    >
                        <option value="">All Providers</option>
                        {availableProviders.map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                )}

                {/* Model Filter */}
                {availableModels.length > 0 && (
                    <select
                        value={filters.model || ''}
                        onChange={(e) => onFiltersChange({ ...filters, model: e.target.value || undefined })}
                        className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                    >
                        <option value="">All Models</option>
                        {availableModels.map((m) => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                )}

                {/* Status Filter */}
                <select
                    value={filters.status || ''}
                    onChange={(e) => onFiltersChange({ ...filters, status: e.target.value || undefined })}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                >
                    <option value="">All Status</option>
                    <option value="success">Success</option>
                    <option value="error">Error</option>
                </select>
            </div>
        </div>
    );
};

export default FilterPanel;
