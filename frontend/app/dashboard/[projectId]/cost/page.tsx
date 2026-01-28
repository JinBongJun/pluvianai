'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { projectsAPI } from '@/lib/api';
import OrgLayout from '@/components/layout/OrgLayout';
import useSWR from 'swr';
import { organizationsAPI } from '@/lib/api';
import FilterPanel, { FilterState } from '@/components/filters/FilterPanel';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Button from '@/components/ui/Button';
import { costAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, Download, RefreshCw, Sparkles, TrendingUp, AlertTriangle, Zap, HelpCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { clsx } from 'clsx';
import ProjectTabs from '@/components/ProjectTabs';
import CostChart from '@/components/CostChart';
import StatsCard from '@/components/StatsCard';
import ExportButton from '@/components/export/ExportButton';

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
  const [orgId, setOrgId] = useState<number | string | null>(null);

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

  // Get project's organization_id
  const { data: project } = useSWR(projectId ? ['project', projectId] : null, () =>
    projectsAPI.get(projectId),
  );

  useEffect(() => {
    if (project?.organization_id) {
      setOrgId(project.organization_id);
    } else if (project && !project.organization_id) {
      // Project has no org, redirect to organizations
      router.push('/organizations');
      return;
    }
  }, [project, router]);

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId!, { includeStats: false }),
  );

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    if (!orgId) {
      return; // Wait for orgId
    }

    loadCostData();
    loadOptimizations();
    loadPredictions();
  }, [projectId, days, orgId, router]);

  const loadCostData = async () => {
    setLoading(true);
    try {
      const data = await costAPI.getAnalysis(projectId, days);
      setCostData(data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load cost data:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load optimizations:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load predictions:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to apply optimization:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, optimizationId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to apply optimization', 'error');
    }
  };

  // Export functionality is handled by ExportButton component
  // No need for separate handleExport function

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ag-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-ag-accent/20 border-t-ag-accent mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (loading && !costData) {
    return (
      <OrgLayout
        orgId={orgId}
        breadcrumb={[
          { label: 'Organizations', href: '/organizations' },
          { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
          { label: 'Cost Analysis' },
        ]}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ag-accent border-t-transparent"></div>
        </div>
      </OrgLayout>
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
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'Cost Analysis' },
      ]}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-white">비용 분석</h1>
              <p className="text-slate-400 mt-1 text-sm">
                Monitor LLM API costs and discover optimization opportunities
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={loadCostData}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <ExportButton projectId={projectId} />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} orgId={orgId} />

        {/* Date Range Selector */}
        <div className="mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} showPeriodLabel={true} />
        </div>

        {/* Summary Stats */}
        {costData && (
          <div className="grid grid-cols-4 gap-4 mb-4">
            <StatsCard
              title="Total"
              value={`$${toFixedSafe(costData.total_cost, 2)}`}
            />
            <StatsCard
              title="Daily Avg"
              value={`$${toFixedSafe(costData.average_daily_cost, 2)}`}
            />
            <StatsCard
              title="Top Model"
              value={topModels[0]?.model || 'N/A'}
            />
            <StatsCard
              title="Top Provider"
              value={topProviders[0]?.provider || 'N/A'}
            />
          </div>
        )}

        {/* Main Chart */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-4 mb-4">
          <div className="mb-3">
            <h3 className="text-sm font-medium text-white">Cost Trends</h3>
            <p className="text-xs text-slate-400 mt-0.5">View daily cost changes</p>
          </div>
          <CostChart projectId={projectId} days={days} />
        </div>

        {/* Breakdown Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top Models */}
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-white">Cost by Model</h3>
              <p className="text-xs text-slate-400 mt-0.5">Cost breakdown by model</p>
            </div>
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
                          className="h-full bg-gradient-to-r from-ag-primary to-ag-primaryHover transition-all duration-500"
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
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-medium text-white">Cost by Provider</h3>
              <p className="text-xs text-slate-400 mt-0.5">Cost breakdown by provider</p>
            </div>
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

        {/* Cost Predictions - Simplified */}
        {predictions && predictions.predictions && predictions.predictions.length > 0 && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-medium text-white">Cost Predictions</h3>
                <p className="text-xs text-slate-400 mt-0.5">Future cost predictions based on historical data</p>
              </div>
              <Badge variant={predictions.trend === 'increasing' ? 'warning' : 'success'} className="text-xs">
                {predictions.trend}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {predictions.predictions.map((pred: any) => (
                <div key={pred.days_ahead} className="text-center">
                  <div className="text-xs text-slate-400 mb-1">{pred.days_ahead}d</div>
                  <div className="text-lg font-bold text-white">
                    ${toFixedSafe(pred.predicted_cost, 2)}
                  </div>
                </div>
              ))}
            </div>
            {predictions.spike_predicted && (
              <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
                ⚠️ Spike predicted: +{toFixedSafe(predictions.trend_percentage, 1)}%
              </div>
            )}
          </div>
        )}

        {/* Cost Optimization Suggestions - Collapsible */}
        {optimizations && optimizations.opportunities && optimizations.opportunities.length > 0 && (
          <div className="mb-4 rounded-lg border border-ag-accent/30 bg-ag-accent/10">
            <button
              onClick={() => setShowOptimizationModal(true)}
              className="w-full flex items-center justify-between p-3 text-left hover:bg-ag-accent/20 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ag-accent" />
                <div>
                  <span className="text-sm font-medium text-ag-accent block">
                    {optimizations.opportunities.length} Cost Optimization Suggestions
                  </span>
                  <span className="text-xs text-slate-400 mt-0.5">
                    Click to view and apply automatic optimization opportunities
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-400 font-medium">
                  ${toFixedSafe(optimizations.total_potential_savings, 2)}/mo potential savings
                </span>
                <Zap className="h-4 w-4 text-slate-400" />
              </div>
            </button>
          </div>
        )}

        {/* Optimization Modal */}
        <Modal
          isOpen={showOptimizationModal}
          onClose={() => setShowOptimizationModal(false)}
          title="Cost Optimization Opportunities"
          size="xl"
        >
          <div className="space-y-4">
            {optimizations && optimizations.opportunities && optimizations.opportunities.length > 0 ? (
              <>
                <div className="p-4 bg-ag-accent/10 border border-ag-accent/30 rounded-lg mb-4">
                  <div className="text-sm font-medium text-ag-accent mb-1">Total Potential Savings</div>
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
                          <span className="text-ag-accent">{opp.recommended_model}</span>
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
    </OrgLayout>
  );
}
