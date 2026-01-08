'use client';

import { useState } from 'react';
import { X, Filter } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
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
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <span className="bg-black text-white text-xs px-2 py-0.5 rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>
          {activeFiltersCount > 0 && (
            <button
              onClick={onReset}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear all
            </button>
          )}
        </div>

        {isOpen && (
          <div className="space-y-4 pt-4 border-t border-gray-200">
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Date
                </label>
                <Input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => updateFilter('dateFrom', e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  To Date
                </label>
                <Input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={(e) => updateFilter('dateTo', e.target.value)}
                />
              </div>
            </div>

            {/* Provider */}
            {availableProviders.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provider
                </label>
                <select
                  value={filters.provider || ''}
                  onChange={(e) => updateFilter('provider', e.target.value || undefined)}
                  className="w-full border-gray-300 rounded-md focus:ring-black focus:border-black"
                >
                  <option value="">All providers</option>
                  {availableProviders.map((provider) => (
                    <option key={provider} value={provider}>
                      {provider}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Model */}
            {availableModels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <select
                  value={filters.model || ''}
                  onChange={(e) => updateFilter('model', e.target.value || undefined)}
                  className="w-full border-gray-300 rounded-md focus:ring-black focus:border-black"
                >
                  <option value="">All models</option>
                  {availableModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                value={filters.status || 'all'}
                onChange={(e) => updateFilter('status', e.target.value as any)}
                className="w-full border-gray-300 rounded-md focus:ring-black focus:border-black"
              >
                <option value="all">All statuses</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </select>
            </div>

            {/* Agent Name */}
            {availableAgents.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <select
                  value={filters.agentName || ''}
                  onChange={(e) => updateFilter('agentName', e.target.value || undefined)}
                  className="w-full border-gray-300 rounded-md focus:ring-black focus:border-black"
                >
                  <option value="">All agents</option>
                  {availableAgents.map((agent) => (
                    <option key={agent} value={agent}>
                      {agent}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <Input
                type="text"
                value={filters.search || ''}
                onChange={(e) => updateFilter('search', e.target.value || undefined)}
                placeholder="Search in prompts and responses..."
              />
            </div>
          </div>
        )}

        {/* Active Filters */}
        {activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-200">
            {Object.entries(filters).map(([key, value]) => {
              if (!value || value === '' || value === 'all') return null;

              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {key}: {String(value)}
                  <button
                    onClick={() => updateFilter(key as keyof FilterState, undefined)}
                    className="hover:text-gray-900"
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
