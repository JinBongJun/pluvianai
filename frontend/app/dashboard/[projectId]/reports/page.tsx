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
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">Reports</h1>
          <p className="text-slate-400 mt-2">Generate and download project reports</p>
        </div>

        {/* Tabs */}
        <ProjectTabs projectId={projectId} />

        {/* Date Range Selector */}
        <div className="mb-6">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>

        {/* Report Configuration */}
        <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Report Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
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
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
              {report && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload('json')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download JSON
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDownload('pdf')}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Report Display */}
        {report && (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {report.type === 'standard' && 'Standard Report'}
                  {report.type === 'detailed' && 'Detailed Report'}
                  {report.type === 'executive' && 'Executive Summary'}
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {report.period.from && report.period.to && (
                    <>
                      {new Date(report.period.from).toLocaleDateString()} - {new Date(report.period.to).toLocaleDateString()}
                    </>
                  )}
                </p>
              </div>
              <div className="text-sm text-slate-400">
                Generated: {new Date(report.generated_at).toLocaleString()}
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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div>
        <h3 className="text-md font-semibold text-white mb-3">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Total API Calls</div>
            <div className="text-2xl font-bold text-white">
              {report.summary.total_api_calls.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Success Rate</div>
            <div className="text-2xl font-bold text-white">
              {toFixedSafe(report.summary.success_rate, 1)}%
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Total Cost</div>
            <div className="text-2xl font-bold text-white">
              ${toFixedSafe(report.summary.total_cost, 2)}
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Avg Quality</div>
            <div className="text-2xl font-bold text-white">
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
          <h3 className="text-md font-semibold text-white mb-3">Quality Scores</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-sm text-slate-400 mb-1">Average</div>
              <div className="text-xl font-semibold text-white">
                {report.summary.quality_scores.average != null ? toFixedSafe(report.summary.quality_scores.average, 1) : 'N/A'}
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-sm text-slate-400 mb-1">Min</div>
              <div className="text-xl font-semibold text-white">
                {report.summary.quality_scores.min != null ? toFixedSafe(report.summary.quality_scores.min, 1) : 'N/A'}
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-sm text-slate-400 mb-1">Max</div>
              <div className="text-xl font-semibold text-white">
                {report.summary.quality_scores.max != null ? toFixedSafe(report.summary.quality_scores.max, 1) : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drift Detections */}
      <div>
        <h3 className="text-md font-semibold text-white mb-3">Drift Detections</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Total Detections</div>
            <div className="text-xl font-bold text-white">
              {report.summary.drift_detections.total}
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">High Severity</div>
            <div className="text-xl font-bold text-white">
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
    <div className="space-y-6">
      {/* Summary Cards */}
      <div>
        <h3 className="text-md font-semibold text-white mb-3">Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Total API Calls</div>
            <div className="text-2xl font-bold text-white">
              {report.summary.total_api_calls.toLocaleString()}
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Success Rate</div>
            <div className="text-2xl font-bold text-white">
              {toFixedSafe(report.summary.success_rate, 1)}%
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Total Cost</div>
            <div className="text-2xl font-bold text-white">
              ${toFixedSafe(report.summary.total_cost, 2)}
            </div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Quality Score</div>
            <div className="text-2xl font-bold text-white">
              {report.summary.quality_scores.average != null ? toFixedSafe(report.summary.quality_scores.average, 1) : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Top Models */}
      {report.breakdown?.by_model?.top_models && report.breakdown.by_model.top_models.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-white mb-3">Top Models by Usage</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Model</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Calls</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Input Tokens</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Output Tokens</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Avg Latency</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {report.breakdown.by_model.top_models.map((model: any, index: number) => (
                  <tr key={index} className="hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-white font-mono">{model.model}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{model.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{model.input_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{model.output_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">
                      {model.avg_latency_ms ? `${toFixedSafe(model.avg_latency_ms / 1000, 2)}s` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right">${toFixedSafe(model.cost, 2)}</td>
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
          <h3 className="text-md font-semibold text-white mb-3">Usage by Provider</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(report.breakdown.by_provider).map(([provider, stats]: [string, any]) => (
              <div key={provider} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm text-slate-400 mb-2 capitalize">{provider}</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Calls:</span>
                    <span className="text-white font-medium">{stats.calls.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Input Tokens:</span>
                    <span className="text-white font-medium">{stats.input_tokens.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Output Tokens:</span>
                    <span className="text-white font-medium">{stats.output_tokens.toLocaleString()}</span>
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
          <h3 className="text-md font-semibold text-white mb-3">Error Breakdown</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(report.breakdown.error_breakdown).map(([statusCode, count]: [string, any]) => (
              <div key={statusCode} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="text-sm text-slate-400 mb-1">Status {statusCode}</div>
                <div className="text-xl font-bold text-white">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Trends */}
      {report.breakdown?.daily_trends && report.breakdown.daily_trends.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-white mb-3">Daily Trends</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Calls</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Input Tokens</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase">Output Tokens</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {report.breakdown.daily_trends.map((day: any, index: number) => (
                  <tr key={index} className="hover:bg-white/5">
                    <td className="px-4 py-3 text-sm text-white">
                      {day.date ? new Date(day.date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-white text-right">{day.calls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{day.input_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-white text-right">{day.output_tokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drift Detections */}
      <div>
        <h3 className="text-md font-semibold text-white mb-3">Drift Detections</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-sm text-slate-400 mb-1">Total</div>
            <div className="text-xl font-bold text-white">{report.summary.drift_detections.total}</div>
          </div>
          <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/30">
            <div className="text-sm text-red-400 mb-1">Critical</div>
            <div className="text-xl font-bold text-red-400">{report.summary.drift_detections.critical || 0}</div>
          </div>
          <div className="p-4 bg-orange-500/10 rounded-lg border border-orange-500/30">
            <div className="text-sm text-orange-400 mb-1">High</div>
            <div className="text-xl font-bold text-orange-400">{report.summary.drift_detections.high_severity || 0}</div>
          </div>
          <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <div className="text-sm text-yellow-400 mb-1">Medium</div>
            <div className="text-xl font-bold text-yellow-400">{report.summary.drift_detections.medium || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Executive Report Component
function ExecutiveReportView({ report }: { report: any }) {
  return (
    <div className="space-y-6">
      {/* Key Metrics - Large Cards */}
      <div>
        <h3 className="text-md font-semibold text-white mb-3">Key Performance Indicators</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-6 bg-gradient-to-br from-purple-500/20 to-purple-500/5 rounded-lg border border-purple-500/30">
            <div className="text-sm text-purple-300 mb-2">Total API Calls</div>
            <div className="text-3xl font-bold text-white mb-1">
              {report.key_metrics.total_api_calls.toLocaleString()}
            </div>
            <div className="text-xs text-purple-400">Period total</div>
          </div>
          <div className="p-6 bg-gradient-to-br from-green-500/20 to-green-500/5 rounded-lg border border-green-500/30">
            <div className="text-sm text-green-300 mb-2">Success Rate</div>
            <div className="text-3xl font-bold text-white mb-1">
              {toFixedSafe(report.key_metrics.success_rate, 1)}%
            </div>
            <div className="text-xs text-green-400">
              {report.key_metrics.success_rate >= 95 ? 'Excellent' : report.key_metrics.success_rate >= 90 ? 'Good' : 'Needs Attention'}
            </div>
          </div>
          <div className="p-6 bg-gradient-to-br from-blue-500/20 to-blue-500/5 rounded-lg border border-blue-500/30">
            <div className="text-sm text-blue-300 mb-2">Total Cost</div>
            <div className="text-3xl font-bold text-white mb-1">
              ${toFixedSafe(report.key_metrics.total_cost, 2)}
            </div>
            <div className="text-xs text-blue-400">
              ${toFixedSafe(report.key_metrics.avg_daily_cost, 2)}/day avg
            </div>
          </div>
          <div className="p-6 bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 rounded-lg border border-cyan-500/30">
            <div className="text-sm text-cyan-300 mb-2">Quality Score</div>
            <div className="text-3xl font-bold text-white mb-1">
              {report.key_metrics.avg_quality_score != null ? toFixedSafe(report.key_metrics.avg_quality_score, 1) : 'N/A'}
            </div>
            <div className="text-xs text-cyan-400">Average quality</div>
          </div>
        </div>
      </div>

      {/* Trends */}
      {report.trends && Object.keys(report.trends).length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-white mb-3">Trends</h3>
          <div className="space-y-4">
            {Object.entries(report.trends).map(([key, trend]: [string, any]) => (
              <div key={key} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white capitalize">{key.replace('_', ' ')}</span>
                  {trend.change_percentage && (
                    <div className={clsx(
                      'flex items-center gap-1 text-sm font-medium',
                      trend.change_percentage > 0 ? 'text-green-400' : 'text-red-400'
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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">First Half:</span>
                    <span className="text-white ml-2 font-medium">{trend.first_half.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Second Half:</span>
                    <span className="text-white ml-2 font-medium">{trend.second_half.toLocaleString()}</span>
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
          <h3 className="text-md font-semibold text-white mb-3">Top Performing Models</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {report.top_performers.map((model: any, index: number) => (
              <div key={index} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">#{index + 1}</span>
                  <span className="text-xs text-purple-400 px-2 py-1 bg-purple-500/20 rounded">Top Performer</span>
                </div>
                <div className="font-mono text-sm text-white mb-3">{model.model}</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Calls:</span>
                    <span className="text-white font-medium">{model.calls.toLocaleString()}</span>
                  </div>
                  {model.avg_latency_ms && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Avg Latency:</span>
                      <span className="text-white font-medium">{toFixedSafe(model.avg_latency_ms / 1000, 2)}s</span>
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
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Critical Issues Detected</span>
          </div>
          <p className="text-sm text-white">
            {report.key_metrics.critical_issues} high or critical severity issues require immediate attention.
          </p>
        </div>
      )}

      {/* Recommendations */}
      {report.recommendations && report.recommendations.length > 0 && (
        <div>
          <h3 className="text-md font-semibold text-white mb-3">Recommendations</h3>
          <div className="space-y-3">
            {report.recommendations.map((rec: any, index: number) => (
              <div
                key={index}
                className={clsx(
                  'p-4 rounded-lg border',
                  rec.type === 'critical' && 'bg-red-500/10 border-red-500/30',
                  rec.type === 'warning' && 'bg-yellow-500/10 border-yellow-500/30',
                  rec.type === 'success' && 'bg-green-500/10 border-green-500/30',
                  rec.type !== 'critical' && rec.type !== 'warning' && rec.type !== 'success' && 'bg-white/5 border-white/10'
                )}
              >
                <div className="flex items-start gap-3">
                  {rec.type === 'critical' && <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />}
                  {rec.type === 'warning' && <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />}
                  {rec.type === 'success' && <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />}
                  {!rec.type && <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-semibold text-white">{rec.title}</h4>
                      <span className={clsx(
                        'text-xs px-2 py-1 rounded',
                        rec.priority === 'high' && 'bg-red-500/20 text-red-400',
                        rec.priority === 'medium' && 'bg-yellow-500/20 text-yellow-400',
                        rec.priority === 'low' && 'bg-green-500/20 text-green-400'
                      )}>
                        {rec.priority} priority
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">{rec.description}</p>
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
