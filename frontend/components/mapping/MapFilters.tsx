'use client';

import { useState, useEffect } from 'react';
import { Filter, X, Search } from 'lucide-react';
import { clsx } from 'clsx';

export interface MapFilters {
  agent_name?: string;
  min_score?: number;
  max_latency?: number;
  has_problems?: boolean;
}

interface MapFiltersProps {
  filters: MapFilters;
  onFiltersChange: (filters: MapFilters) => void;
  availableAgents?: string[];
  className?: string;
}

export default function MapFilters({
  filters,
  onFiltersChange,
  availableAgents = [],
  className,
}: MapFiltersProps) {
  const [localFilters, setLocalFilters] = useState<MapFilters>(filters);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  const handleFilterChange = (key: keyof MapFilters, value: any) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const handleReset = () => {
    const emptyFilters: MapFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(localFilters).some(
    (v) => v !== undefined && v !== null && v !== ''
  );

  return (
    <div className={clsx('relative', className)}>
      {/* Filter Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          'px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2',
          hasActiveFilters
            ? 'bg-purple-600 text-white hover:bg-purple-700'
            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
        )}
      >
        <Filter className="w-4 h-4" />
        Filters
        {hasActiveFilters && (
          <span className="ml-1 px-1.5 py-0.5 bg-white/20 rounded text-xs">
            {Object.values(localFilters).filter((v) => v !== undefined && v !== null && v !== '').length}
          </span>
        )}
      </button>

      {/* Filter Panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Filter Map</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            {/* Agent Name Filter with Search */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Agent Name
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={localFilters.agent_name || ''}
                  onChange={(e) => handleFilterChange('agent_name', e.target.value || undefined)}
                  placeholder="Search agent name..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              {availableAgents && availableAgents.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {availableAgents
                    .filter((agent) =>
                      !localFilters.agent_name ||
                      agent.toLowerCase().includes(localFilters.agent_name.toLowerCase())
                    )
                    .slice(0, 5)
                    .map((agent) => (
                      <button
                        key={agent}
                        onClick={() => handleFilterChange('agent_name', agent)}
                        className="w-full text-left px-2 py-1 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                      >
                        {agent}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Min Score Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Minimum Score: {localFilters.min_score?.toFixed(1) || '0.0'}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={localFilters.min_score || 0}
                onChange={(e) => handleFilterChange('min_score', parseFloat(e.target.value) || undefined)}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0.0</span>
                <span>5.0</span>
              </div>
            </div>

            {/* Max Latency Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Max Latency: {localFilters.max_latency ? `${localFilters.max_latency}ms` : 'No limit'}
              </label>
              <input
                type="range"
                min="0"
                max="5000"
                step="100"
                value={localFilters.max_latency || 5000}
                onChange={(e) => handleFilterChange('max_latency', parseInt(e.target.value) || undefined)}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-1">
                <span>0ms</span>
                <span>5000ms</span>
              </div>
            </div>

            {/* Has Problems Filter */}
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localFilters.has_problems || false}
                  onChange={(e) => handleFilterChange('has_problems', e.target.checked || undefined)}
                  className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-purple-600 focus:ring-purple-500"
                />
                <span className="text-sm text-slate-300">Show only problem nodes</span>
              </label>
              <p className="text-xs text-slate-500 mt-1 ml-6">
                Nodes with score &lt; 3.0 or success rate &lt; 90%
              </p>
            </div>

            {/* Reset Button */}
            {hasActiveFilters && (
              <button
                onClick={handleReset}
                className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
