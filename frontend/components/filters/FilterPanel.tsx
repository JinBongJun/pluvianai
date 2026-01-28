'use client';

import { useState } from 'react';
import { X, Filter } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { clsx } from 'clsx';

export interface FilterState {
  dateFrom?: string;
  dateTo?: string;
  provider?: string;
  model?: string;
  status?: 'success' | 'error' | 'all';
  agentName?: string;
  chainId?: string;
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

export default function FilterPanel({
  filters,
  onFiltersChange,
  onReset,
  availableProviders = [],
  availableModels = [],
  availableAgents = [],
}: FilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const activeFiltersCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== '' && v !== 'all'
  ).length;

  return (
    <div className="relative rounded-2xl border border-white/10 bg-ag-surface shadow-2xl">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 text-sm font-medium text-ag-text hover:text-ag-accentLight transition-colors"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="bg-ag-accent text-ag-text text-xs px-2 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {activeFiltersCount > 0 && (
            <button
              onClick={onReset}
              className="text-sm text-ag-muted hover:text-ag-text transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {isOpen && (
          <div className="space-y-4 pt-4 border-t border-white/10">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Date Range
              </label>
              <DateRangePicker
                value={{
                  from: filters.dateFrom ? new Date(filters.dateFrom) : null,
                  to: filters.dateTo ? new Date(filters.dateTo) : null,
                }}
                onChange={(range) => {
                  updateFilter('dateFrom', range.from ? range.from.toISOString().split('T')[0] : undefined);
                  updateFilter('dateTo', range.to ? range.to.toISOString().split('T')[0] : undefined);
                }}
                showPeriodLabel={false}
              />
            </div>

            {/* Provider */}
            {availableProviders.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-ag-text mb-1">
                  Provider
                </label>
                <select
                  value={filters.provider || ''}
                  onChange={(e) => updateFilter('provider', e.target.value || undefined)}
                  className="w-full bg-ag-surface border border-white/10 rounded-md text-ag-text focus:ring-ag-accent focus:border-ag-accent px-3 py-2"
                >
                  <option value="" className="bg-ag-surface">All providers</option>
                  {availableProviders.map((provider) => (
                    <option key={provider} value={provider} className="bg-ag-surface">
                      {provider}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Model */}
            {availableModels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-ag-text mb-1">
                  Model
                </label>
                <select
                  value={filters.model || ''}
                  onChange={(e) => updateFilter('model', e.target.value || undefined)}
                  className="w-full bg-ag-surface border border-white/10 rounded-md text-ag-text focus:ring-ag-accent focus:border-ag-accent px-3 py-2"
                >
                  <option value="" className="bg-ag-surface">All models</option>
                  {availableModels.map((model) => (
                    <option key={model} value={model} className="bg-ag-surface">
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-ag-text mb-1">
                Status
              </label>
              <select
                value={filters.status || 'all'}
                onChange={(e) => updateFilter('status', e.target.value as any)}
                className="w-full bg-ag-surface border border-white/10 rounded-md text-ag-text focus:ring-ag-accent focus:border-ag-accent px-3 py-2"
              >
                <option value="all" className="bg-ag-surface">All statuses</option>
                <option value="success" className="bg-ag-surface">Success</option>
                <option value="error" className="bg-ag-surface">Error</option>
              </select>
            </div>

            {/* Agent Name */}
            {availableAgents.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-ag-text mb-1">
                  Agent
                </label>
                <select
                  value={filters.agentName || ''}
                  onChange={(e) => updateFilter('agentName', e.target.value || undefined)}
                  className="w-full bg-ag-surface border border-white/10 rounded-md text-ag-text focus:ring-ag-accent focus:border-ag-accent px-3 py-2"
                >
                  <option value="" className="bg-ag-surface">All agents</option>
                  {availableAgents.map((agent) => (
                    <option key={agent} value={agent} className="bg-ag-surface">
                      {agent}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Search
              </label>
              <Input
                type="text"
                value={filters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value || undefined)}
                placeholder="Search in prompts and responses..."
                className="bg-white/5 border-white/10 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
        )}

        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/10">
            {Object.entries(filters).map(([key, value]) => {
              if (!value || value === '' || value === 'all') return null;

              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-ag-accent/20 text-ag-text text-xs rounded border border-ag-accent/30"
                >
                  {key}: {String(value)}
                  <button
                    onClick={() => updateFilter(key as keyof FilterState, undefined)}
                    className="hover:text-ag-accentLight transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
