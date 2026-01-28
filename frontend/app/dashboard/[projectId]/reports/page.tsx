'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import DateRangePicker from '@/components/ui/DateRangePicker';
import Select from '@/components/ui/Select';
import { reportsAPI } from '@/lib/api';
import { toFixedSafe } from '@/lib/format';
import { useToast } from '@/components/ToastContainer';
import { FileText, Download, Calendar, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import ProjectTabs from '@/components/ProjectTabs';
import { clsx } from 'clsx';

export default function ReportsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);

  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [template, setTemplate] = useState('standard');
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({
    from: (() => {
      const date = new Date();
      date.setDate(date.getDate() - 30);
      return date;
    })(),
    to: new Date(),
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
  }, [router]);

  const handleGenerate = async () => {
    if (!dateRange.from || !dateRange.to) {
      toast.showToast('Please select a date range', 'warning');
      return;
    }

    setLoading(true);
    try {
      const data = await reportsAPI.generate(projectId, {
        template,
        date_from: dateRange.from.toISOString(),
        date_to: dateRange.to.toISOString(),
      });
      setReport(data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to generate report:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to generate report', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: 'json' | 'pdf') => {
    if (!dateRange.from || !dateRange.to) {
      toast.showToast('Please select a date range', 'warning');
      return;
    }

    try {
      await reportsAPI.download(projectId, {
        template,
        format,
        date_from: dateRange.from.toISOString(),
        date_to: dateRange.to.toISOString(),
      });
      toast.showToast('Report downloaded successfully', 'success');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to download report:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      const errorMessage = error.message || error.response?.data?.detail || error.response?.data?.message || 'Failed to download report';
      toast.showToast(errorMessage, 'error');
    }
  };

  return (
    <DashboardLayout
      breadcrumb={[
        { label: 'Dashboard', href: '/organizations' },
        { label: 'Reports' },
      ]}
    >
      <div className="bg-ag-bg">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-ag-text">Reports</h1>
          <p className="text-ag-muted mt-2">Generate and download project reports</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Date Range Selector */}
        <div className="mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Report Configuration */}
        <div className="relative rounded-2xl border border-white/10 bg-ag-surface p-6 shadow-2xl mb-6">
          <h2 className="text-lg font-semibold text-ag-text mb-4">Report Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ag-text mb-2">
                Template
              </label>
              <Select
                value={template}
                onChange={(value) => setTemplate(value || 'standard')}
                placeholder="Select template..."
                options={[
                  { value: 'standard', label: 'Standard Report' },
                  { value: 'detailed', label: 'Detailed Report' },
                  { value: 'executive', label: 'Executive Summary' },
                ]}
                className="w-full"
              />
            </div>

            <div className="flex gap-3">
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : 'Generate Report'}
              </Button>
              {report && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload('json')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    JSON
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload('pdf')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Report Display */}
        {report && (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-ag-surface p-6 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
              <div>
                <h2 className="text-2xl font-bold text-ag-text">
                  {report.type === 'standard' && 'Standard Report'}
                  {report.type === 'detailed' && 'Detailed Report'}
                  {report.type === 'executive' && 'Executive Summary'}
                </h2>
                <div className="flex items-center gap-2 text-ag-muted mt-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  {report.period.from && report.period.to && (
                    <span>
                      {new Date(report.period.from).toLocaleDateString()} - {new Date(report.period.to).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ag-muted uppercase tracking-widest font-bold">Generated at</div>
                <div className="text-ag-text font-medium">{new Date(report.generated_at).toLocaleString()}</div>
              </div>
            </div>

            {/* Template-specific rendering */}
            {report.type === 'standard' && (
              <StandardReportView report={report} />
            )}
            
            {report.type === 'detailed' && (
              <DetailedReportView report={report} />
            )}
            
            {report.type === 'executive' && (
              <ExecutiveReportView report={report} />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Standard Report Component
function StandardReportView({ report }: { report: any }) {
  return (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div>
        <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Total API Calls</div>
            <div className="text-2xl font-bold text-ag-text">
              {report.summary.total_api_calls.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Success Rate</div>
            <div className="text-2xl font-bold text-ag-text">
              {toFixedSafe(report.summary.success_rate, 1)}%
            </div>
          </div>
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Total Cost</div>
            <div className="text-2xl font-bold text-ag-text">
              ${toFixedSafe(report.summary.total_cost, 2)}
            </div>
          </div>
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Avg Quality</div>
            <div className="text-2xl font-bold text-ag-text">
              {report.summary.quality_scores.average
                ? toFixedSafe(report.summary.quality_scores.average, 1)
                : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Quality Scores */}
      {report.summary.quality_scores.total_evaluations > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Quality Metrics</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-ag-bg border border-white/5 rounded-lg">
              <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Average</div>
              <div className="text-xl font-semibold text-ag-text">
                {report.summary.quality_scores.average != null ? toFixedSafe(report.summary.quality_scores.average, 1) : 'N/A'}
              </div>
            </div>
            <div className="p-4 bg-ag-bg border border-white/5 rounded-lg">
              <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Min</div>
              <div className="text-xl font-semibold text-ag-text text-red-400">
                {report.summary.quality_scores.min != null ? toFixedSafe(report.summary.quality_scores.min, 1) : 'N/A'}
              </div>
            </div>
            <div className="p-4 bg-ag-bg border border-white/5 rounded-lg">
              <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Max</div>
              <div className="text-xl font-semibold text-ag-text text-emerald-400">
                {report.summary.quality_scores.max != null ? toFixedSafe(report.summary.quality_scores.max, 1) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drift Detections */}
      <div>
        <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Drift Detections</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Total Detections</div>
            <div className="text-xl font-bold text-ag-text">
              {report.summary.drift_detections.total}
            </div>
          </div>
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
            <div className="text-xs text-red-400 mb-1 uppercase tracking-wider">High Severity</div>
            <div className="text-xl font-bold text-red-400">
              {report.summary.drift_detections.high_severity}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Detailed Report Component
function DetailedReportView({ report }: { report: any }) {
  return (
    <div className="space-y-10">
      {/* Summary Cards */}
      <div>
        <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Total API Calls</div>
            <div className="text-2xl font-bold text-ag-text">
              {report.summary.total_api_calls.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Success Rate</div>
            <div className="text-2xl font-bold text-ag-text">
              {toFixedSafe(report.summary.success_rate, 1)}%
            </div>
          </div>
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Total Cost</div>
            <div className="text-2xl font-bold text-ag-text">
              ${toFixedSafe(report.summary.total_cost, 2)}
            </div>
          </div>
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Avg Quality</div>
            <div className="text-2xl font-bold text-ag-text">
              {report.summary.quality_scores.average != null ? toFixedSafe(report.summary.quality_scores.average, 1) : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Top Models */}
      {report.breakdown?.by_model?.top_models && report.breakdown.by_model.top_models.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Top Models by Usage</h3>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5 text-ag-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Model</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase">Calls</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase">Tokens (I/O)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase">Avg Latency</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.breakdown.by_model.top_models.map((model: any, index: number) => (
                  <tr key={index} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm text-ag-text font-mono">{model.model}</td>
                    <td className="px-4 py-3 text-sm text-ag-text text-right font-medium">{model.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-ag-muted text-right">
                      {model.input_tokens.toLocaleString()} / {model.output_tokens.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-ag-text text-right font-mono">
                      {model.avg_latency_ms ? `${toFixedSafe(model.avg_latency_ms / 1000, 2)}s` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-emerald-400 text-right font-bold">${toFixedSafe(model.cost, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provider Breakdown */}
      {report.breakdown?.by_provider && Object.keys(report.breakdown.by_provider).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Usage by Provider</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(report.breakdown.by_provider).map(([provider, stats]: [string, any]) => (
              <div key={provider} className="p-4 bg-ag-bg border border-white/5 rounded-lg">
                <div className="text-xs text-ag-accent uppercase tracking-widest font-bold mb-3">{provider}</div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-ag-muted">Calls:</span>
                    <span className="text-ag-text font-medium">{stats.calls.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ag-muted">In Tokens:</span>
                    <span className="text-ag-text font-medium">{stats.input_tokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-ag-muted">Out Tokens:</span>
                    <span className="text-ag-text font-medium">{stats.output_tokens.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Breakdown */}
      {report.breakdown?.error_breakdown && Object.keys(report.breakdown.error_breakdown).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Error Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(report.breakdown.error_breakdown).map(([statusCode, count]: [string, any]) => (
              <div key={statusCode} className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div className="text-xs text-red-400 mb-1 uppercase tracking-wider">Status {statusCode}</div>
                <div className="text-2xl font-black text-red-400">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Trends */}
      {report.breakdown?.daily_trends && report.breakdown.daily_trends.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Daily Trends</h3>
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5 text-ag-muted">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase">Calls</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase">Tokens (I/O)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.breakdown.daily_trends.map((day: any, index: number) => (
                  <tr key={index} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 text-sm text-ag-text">
                      {day.date ? new Date(day.date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-ag-text text-right font-medium">{day.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-ag-muted text-right font-mono">
                      {day.input_tokens.toLocaleString()} / {day.output_tokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drift Detections */}
      <div>
        <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Drift Detections</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
            <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Total</div>
            <div className="text-xl font-bold text-ag-text">{report.summary.drift_detections.total}</div>
          </div>
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
            <div className="text-xs text-red-400 mb-1 uppercase tracking-wider">Critical</div>
            <div className="text-xl font-bold text-red-400">{report.summary.drift_detections.critical || 0}</div>
          </div>
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg">
            <div className="text-xs text-amber-400 mb-1 uppercase tracking-wider">High</div>
            <div className="text-xl font-bold text-amber-400">{report.summary.drift_detections.high_severity || 0}</div>
          </div>
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
            <div className="text-xs text-emerald-400 mb-1 uppercase tracking-wider">Medium</div>
            <div className="text-xl font-bold text-emerald-400">{report.summary.drift_detections.medium || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Executive Report Component
function ExecutiveReportView({ report }: { report: any }) {
  return (
    <div className="space-y-10">
      {/* Key Metrics - Large Cards */}
      <div>
        <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Key Performance Indicators</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-6 bg-ag-accent/10 rounded-xl border border-ag-accent/30 shadow-lg shadow-ag-accent/5">
            <div className="text-xs text-ag-accent uppercase tracking-widest font-bold mb-2">Total API Calls</div>
            <div className="text-3xl font-black text-ag-text mb-1">
              {report.key_metrics.total_api_calls.toLocaleString()}
            </div>
            <div className="text-[10px] text-ag-accent/60 uppercase tracking-widest font-bold">Period total</div>
          </div>
          <div className="p-6 bg-emerald-500/10 rounded-xl border border-emerald-500/30 shadow-lg shadow-emerald-500/5">
            <div className="text-xs text-emerald-400 uppercase tracking-widest font-bold mb-2">Success Rate</div>
            <div className="text-3xl font-black text-ag-text mb-1">
              {toFixedSafe(report.key_metrics.success_rate, 1)}%
            </div>
            <div className="text-[10px] text-emerald-400/60 uppercase tracking-widest font-bold">
              {report.key_metrics.success_rate >= 95 ? 'Excellent' : report.key_metrics.success_rate >= 90 ? 'Good' : 'Needs Attention'}
            </div>
          </div>
          <div className="p-6 bg-sky-500/10 rounded-xl border border-sky-500/30 shadow-lg shadow-sky-500/5">
            <div className="text-xs text-sky-400 uppercase tracking-widest font-bold mb-2">Total Cost</div>
            <div className="text-3xl font-black text-ag-text mb-1">
              ${toFixedSafe(report.key_metrics.total_cost, 2)}
            </div>
            <div className="text-[10px] text-sky-400/60 uppercase tracking-widest font-bold">
              ${toFixedSafe(report.key_metrics.avg_daily_cost, 2)}/day avg
            </div>
          </div>
          <div className="p-6 bg-ag-accent/10 rounded-xl border border-ag-accent/30 shadow-lg shadow-ag-accent/5">
            <div className="text-xs text-ag-accent uppercase tracking-widest font-bold mb-2">Quality Score</div>
            <div className="text-3xl font-black text-ag-text mb-1">
              {report.key_metrics.avg_quality_score != null ? toFixedSafe(report.key_metrics.avg_quality_score, 1) : 'N/A'}
            </div>
            <div className="text-[10px] text-ag-accent/60 uppercase tracking-widest font-bold">Average quality</div>
          </div>
        </div>
      </div>

      {/* Trends */}
      {report.trends && Object.keys(report.trends).length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Performance Trends</h3>
          <div className="space-y-4">
            {Object.entries(report.trends).map(([key, trend]: [string, any]) => (
              <div key={key} className="p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-ag-text uppercase tracking-widest">{key.replace('_', ' ')}</span>
                  {trend.change_percentage != null && (
                    <div className={clsx(
                      'flex items-center gap-1 text-sm font-bold',
                      trend.change_percentage > 0 ? 'text-emerald-400' : 'text-red-400'
                    )}>
                      {trend.change_percentage > 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {toFixedSafe(Math.abs(trend.change_percentage), 1)}%
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-8 text-sm">
                  <div className="border-r border-white/5 pr-4">
                    <span className="text-[10px] text-ag-muted uppercase tracking-widest font-bold block mb-1">First Half</span>
                    <span className="text-xl font-bold text-ag-text">{trend.first_half.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-ag-muted uppercase tracking-widest font-bold block mb-1">Second Half</span>
                    <span className="text-xl font-bold text-ag-text">{trend.second_half.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Performers */}
      {report.top_performers && report.top_performers.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Top Performing Models</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.top_performers.map((model: any, index: number) => (
              <div key={index} className="p-4 bg-ag-bg border border-white/5 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-black text-ag-muted uppercase tracking-widest">Rank #{index + 1}</span>
                  <Badge variant="success" size="sm" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Top Performer</Badge>
                </div>
                <div className="font-mono text-sm text-ag-text font-bold mb-4">{model.model}</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ag-muted">Total Calls:</span>
                    <span className="text-ag-text font-bold">{model.calls.toLocaleString()}</span>
                  </div>
                  {model.avg_latency_ms && (
                    <div className="flex justify-between">
                      <span className="text-ag-muted">Avg Latency:</span>
                      <span className="text-ag-text font-bold">{toFixedSafe(model.avg_latency_ms / 1000, 2)}s</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical Issues */}
      {report.key_metrics.critical_issues > 0 && (
        <div className="p-6 bg-red-500/5 border border-red-500/30 rounded-xl shadow-lg shadow-red-500/5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
            <h4 className="text-lg font-bold text-red-400 uppercase tracking-widest">Critical Issues Detected</h4>
          </div>
          <p className="text-sm text-red-300/90 leading-relaxed">
            {report.key_metrics.critical_issues} high or critical severity issues require immediate attention. 
            Check the drift detection and quality drop sections for more details.
          </p>
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ag-text uppercase tracking-widest mb-4">Strategic Recommendations</h3>
          <div className="space-y-4">
            {report.recommendations.map((rec: any, index: number) => (
              <div
                key={index}
                className={clsx(
                  'p-5 rounded-xl border transition-all duration-300 hover:shadow-lg',
                  rec.type === 'critical' && 'bg-red-500/5 border-red-500/30 hover:bg-red-500/10',
                  rec.type === 'warning' && 'bg-amber-500/5 border-amber-500/30 hover:bg-amber-500/10',
                  rec.type === 'success' && 'bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10',
                  rec.type !== 'critical' && rec.type !== 'warning' && rec.type !== 'success' && 'bg-white/5 border-white/10 hover:bg-white/10'
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1">
                    {rec.type === 'critical' && <AlertTriangle className="h-6 w-6 text-red-400" />}
                    {rec.type === 'warning' && <AlertTriangle className="h-6 w-6 text-amber-400" />}
                    {rec.type === 'success' && <CheckCircle className="h-6 w-6 text-emerald-400" />}
                    {!rec.type && <Info className="h-6 w-6 text-sky-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-bold text-ag-text truncate">{rec.title}</h4>
                      <span className={clsx(
                        'text-[10px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest',
                        rec.priority === 'high' && 'bg-red-500/20 text-red-400 border border-red-500/30',
                        rec.priority === 'medium' && 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
                        rec.priority === 'low' && 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      )}>
                        {rec.priority} PRIORITY
                      </span>
                    </div>
                    <p className="text-sm text-ag-muted leading-relaxed">{rec.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
    </div>
  );
}
