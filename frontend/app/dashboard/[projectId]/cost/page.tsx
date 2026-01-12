'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import FilterPanel, { FilterState } from '@/components/filters/FilterPanel';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Button from '@/components/ui/Button';
import { costAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, Download, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';
import CostChart from '@/components/CostChart';
import StatsCard from '@/components/StatsCard';

interface CostAnalysis {
  total_cost: number;
  by_model: Record<string, number>;
  by_provider: Record<string, number>;
  by_day: Array<{ date: string; cost: number }>;
  average_daily_cost: number;
  cost_trend?: {
    percentage_change: number;
    is_increasing: boolean;
  };
}

export default function CostAnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [costData, setCostData] = useState<CostAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      return date;
    })(),
    to: new Date(),
  });

  // Update days when dateRange changes
  useEffect(() => {
    if (dateRange.from && dateRange.to) {
      const diffTime = Math.abs(dateRange.to.getTime() - dateRange.from.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      // Clamp to max 30 days (backend limit)
      const clampedDays = Math.min(Math.max(1, diffDays), 30);
      setDays(clampedDays);
    }
  }, [dateRange]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadCostData();
  }, [projectId, days, router]);

  const loadCostData = async () => {
    setLoading(true);
    try {
      const data = await costAPI.getAnalysis(projectId, days);
      setCostData(data);
    } catch (error: any) {
      console.error('Failed to load cost data:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load cost data', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    toast.showToast('Export functionality coming soon', 'info');
  };

  if (loading && !costData) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate top models and providers
  const topModels = costData
    ? Object.entries(costData.by_model)
        .map(([model, cost]) => ({ model, cost }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5)
    : [];

  const topProviders = costData
    ? Object.entries(costData.by_provider)
        .map(([provider, cost]) => ({ provider, cost }))
        .sort((a, b) => b.cost - a.cost)
    : [];

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">Cost Analysis</h1>
              <p className="text-slate-400 mt-2">Track and analyze your LLM API costs</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={loadCostData}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Date Range Selector */}
        <div className="mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} showPeriodLabel={true} />
        </div>

        {/* Summary Stats */}
        {costData && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatsCard
              title="Total Cost"
              value={`$${costData.total_cost.toFixed(2)}`}
              subtitle={`Last ${days} days`}
            />
            <StatsCard
              title="Average Daily"
              value={`$${costData.average_daily_cost.toFixed(2)}`}
              subtitle={`Last ${days} days`}
            />
            <StatsCard
              title="Top Model"
              value={topModels[0]?.model || 'N/A'}
              subtitle={topModels[0] ? `$${topModels[0].cost.toFixed(2)}` : undefined}
            />
            <StatsCard
              title="Top Provider"
              value={topProviders[0]?.provider || 'N/A'}
              subtitle={topProviders[0] ? `$${topProviders[0].cost.toFixed(2)}` : undefined}
            />
          </div>
        )}

        {/* Main Chart */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl transition-all duration-300 hover:border-white/20 hover:shadow-glow-purple mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Cost Trends</h2>
          </div>
          <CostChart projectId={projectId} days={days} />
        </div>

        {/* Breakdown Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Models */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Cost by Model</h3>
            {topModels.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No cost data available</div>
            ) : (
              <div className="space-y-3">
                {topModels.map((item, index) => {
                  const percentage = costData
                    ? (item.cost / costData.total_cost) * 100
                    : 0;
                  return (
                    <div key={item.model} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white font-medium truncate flex-1 mr-2">
                          {item.model}
                        </span>
                        <span className="text-slate-300 font-mono">
                          ${item.cost.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400">
                        {percentage.toFixed(1)}% of total
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Top Providers */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Cost by Provider</h3>
            {topProviders.length === 0 ? (
              <div className="text-center py-8 text-slate-400">No cost data available</div>
            ) : (
              <div className="space-y-3">
                {topProviders.map((item) => {
                  const percentage = costData
                    ? (item.cost / costData.total_cost) * 100
                    : 0;
                  return (
                    <div key={item.provider} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-white font-medium capitalize truncate flex-1 mr-2">
                          {item.provider}
                        </span>
                        <span className="text-slate-300 font-mono">
                          ${item.cost.toFixed(2)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-pink-500 to-pink-600 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400">
                        {percentage.toFixed(1)}% of total
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
