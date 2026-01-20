'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import FilterPanel, { FilterState } from '@/components/filters/FilterPanel';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Button from '@/components/ui/Button';
import { costAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, Download, RefreshCw, Sparkles, TrendingUp, AlertTriangle, Zap } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
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
  const [optimizations, setOptimizations] = useState<any>(null);
  const [predictions, setPredictions] = useState<any>(null);
  const [loadingOptimizations, setLoadingOptimizations] = useState(false);
  const [showOptimizationModal, setShowOptimizationModal] = useState(false);
  const [selectedOptimization, setSelectedOptimization] = useState<any>(null);
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
    loadOptimizations();
    loadPredictions();
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

  const loadOptimizations = async () => {
    setLoadingOptimizations(true);
    try {
      const result = await costAPI.getOptimizations(projectId, 30);
      setOptimizations(result);
    } catch (error: any) {
      console.error('Failed to load optimizations:', error);
      // Don't show error - optimizations are optional
    } finally {
      setLoadingOptimizations(false);
    }
  };

  const loadPredictions = async () => {
    try {
      const result = await costAPI.getPredictions(projectId, 30, 30);
      setPredictions(result);
    } catch (error: any) {
      console.error('Failed to load predictions:', error);
      // Don't show error - predictions are optional
    }
  };

  const handleApplyOptimization = async (optimizationId: string) => {
    try {
      const result = await costAPI.applyOptimization(projectId, optimizationId, true);
      toast.showToast('Optimization applied successfully', 'success');
      setShowOptimizationModal(false);
      loadOptimizations();
    } catch (error: any) {
      console.error('Failed to apply optimization:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to apply optimization', 'error');
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

  // Format date range for display
  const formatDateRange = () => {
    if (!dateRange.from || !dateRange.to) return '';
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
      });
    };
    
    return `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`;
  };

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
              value={`$${toFixedSafe(costData.total_cost, 2)}`}
              subtitle={formatDateRange()}
            />
            <StatsCard
              title="Average Daily"
              value={`$${toFixedSafe(costData.average_daily_cost, 2)}`}
              subtitle={formatDateRange()}
            />
            <StatsCard
              title="Top Model"
              value={topModels[0]?.model || 'N/A'}
              subtitle={topModels[0] ? `$${toFixedSafe(topModels[0].cost, 2)}` : undefined}
            />
            <StatsCard
              title="Top Provider"
              value={topProviders[0]?.provider || 'N/A'}
              subtitle={topProviders[0] ? `$${toFixedSafe(topProviders[0].cost, 2)}` : undefined}
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
                          ${toFixedSafe(item.cost, 2)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-600 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400">
                        {toFixedSafe(percentage, 1)}% of total
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
                          ${toFixedSafe(item.cost, 2)}
                        </span>
                      </div>
                      <div className="w-full bg-slate-700/50 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-pink-500 to-pink-600 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400">
                        {toFixedSafe(percentage, 1)}% of total
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cost Predictions */}
        {predictions && predictions.predictions && predictions.predictions.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-blue-500/30 bg-blue-500/10 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-6 w-6 text-blue-400" />
                <h2 className="text-lg font-semibold text-blue-400">Cost Predictions</h2>
              </div>
              <Badge variant={predictions.trend === 'increasing' ? 'warning' : 'success'}>
                {predictions.trend}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {predictions.predictions.map((pred: any) => (
                <div key={pred.days_ahead} className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="text-sm text-slate-400 mb-1">{pred.days_ahead} Days</div>
                  <div className="text-xl font-bold text-white mb-1">
                    ${toFixedSafe(pred.predicted_cost, 2)}
                  </div>
                  <div className="text-xs text-slate-400">
                    ${toFixedSafe(pred.predicted_daily_avg, 2)}/day • {toFixedSafe(pred.confidence * 100, 0)}% confidence
                  </div>
                </div>
              ))}
            </div>
            {predictions.spike_predicted && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Cost spike predicted: {toFixedSafe(predictions.trend_percentage, 1)}% increase</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cost Optimization Suggestions */}
        {optimizations && optimizations.opportunities && optimizations.opportunities.length > 0 && (
          <div className="mb-6 relative rounded-2xl border border-purple-500/30 bg-purple-500/10 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-purple-400" />
                <h2 className="text-lg font-semibold text-purple-400">Optimization Opportunities</h2>
              </div>
              <div className="text-sm text-purple-300">
                Potential Savings: <span className="font-bold text-green-400">
                  ${toFixedSafe(optimizations.total_potential_savings, 2)}/month
                </span>
              </div>
            </div>
            <div className="space-y-4">
              {optimizations.opportunities.slice(0, 3).map((opp: any, idx: number) => (
                <div key={idx} className="p-4 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">
                        {opp.type === "model_downgrade" && "Model Downgrade"}
                        {opp.type === "cost_optimization" && "Cost Optimization"}
                        {opp.type === "remove_unused_model" && "Remove Unused Model"}
                      </span>
                      <Badge variant={opp.risk === "low" || opp.risk === "none" ? "success" : "warning"}>
                        {opp.risk} risk
                      </Badge>
                    </div>
                    <div className="text-green-400 font-bold">
                      ${toFixedSafe(opp.estimated_monthly_savings, 2)}/mo
                    </div>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">{opp.reason}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Current: </span>
                      <span className="text-white">{opp.current_model}</span>
                    </div>
                    {opp.recommended_model && (
                      <div>
                        <span className="text-slate-400">Recommended: </span>
                        <span className="text-purple-400">{opp.recommended_model}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-slate-400">Savings: </span>
                      <span className="text-green-400">{toFixedSafe(opp.savings_percentage, 1)}%</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Quality: </span>
                      <span className={clsx(
                        opp.quality_change >= 0 ? 'text-green-400' : 'text-yellow-400'
                      )}>
                        {opp.quality_change > 0 ? '+' : ''}{toFixedSafe(opp.quality_change, 1)}%
                      </span>
                    </div>
                  </div>
                  {opp.requires_approval && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedOptimization(opp);
                          setShowOptimizationModal(true);
                        }}
                        className="w-full"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Apply This Optimization
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {optimizations.opportunities.length > 3 && (
              <div className="mt-4 text-center">
                <Button
                  variant="ghost"
                  onClick={() => setShowOptimizationModal(true)}
                >
                  View All {optimizations.opportunities.length} Opportunities
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Optimization Modal */}
        <Modal
          isOpen={showOptimizationModal}
          onClose={() => setShowOptimizationModal(false)}
          title="Cost Optimization Opportunities"
          size="large"
        >
          <div className="space-y-4">
            {optimizations && optimizations.opportunities && optimizations.opportunities.length > 0 ? (
              <>
                <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg mb-4">
                  <div className="text-sm font-medium text-purple-400 mb-1">Total Potential Savings</div>
                  <div className="text-2xl font-bold text-green-400">
                    ${toFixedSafe(optimizations.total_potential_savings, 2)}/month
                  </div>
                </div>
                {optimizations.opportunities.map((opp: any, idx: number) => (
                  <div key={idx} className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          {opp.type === "model_downgrade" && "Model Downgrade"}
                          {opp.type === "cost_optimization" && "Cost Optimization"}
                          {opp.type === "remove_unused_model" && "Remove Unused Model"}
                        </span>
                        <Badge variant={opp.risk === "low" || opp.risk === "none" ? "success" : "warning"}>
                          {opp.risk} risk
                        </Badge>
                      </div>
                      <div className="text-green-400 font-bold">
                        ${toFixedSafe(opp.estimated_monthly_savings, 2)}/mo
                      </div>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{opp.reason}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-slate-400">Current: </span>
                        <span className="text-white">{opp.current_model}</span>
                      </div>
                      {opp.recommended_model && (
                        <div>
                          <span className="text-slate-400">Recommended: </span>
                          <span className="text-purple-400">{opp.recommended_model}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-slate-400">Savings: </span>
                        <span className="text-green-400">{toFixedSafe(opp.savings_percentage, 1)}%</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Quality: </span>
                        <span className={clsx(
                          opp.quality_change >= 0 ? 'text-green-400' : 'text-yellow-400'
                        )}>
                          {opp.quality_change > 0 ? '+' : ''}{toFixedSafe(opp.quality_change, 1)}%
                        </span>
                      </div>
                    </div>
                    {opp.requires_approval && (
                      <Button
                        size="sm"
                        onClick={() => handleApplyOptimization(opp.type + '_' + idx)}
                        className="w-full"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        Apply This Optimization
                      </Button>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No optimization opportunities available at this time.</p>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
