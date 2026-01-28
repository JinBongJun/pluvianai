'use client';

import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from 'lucide-react';
import { insightsAPI } from '@/lib/api';
import { clsx } from 'clsx';

interface DailyInsightProps {
  projectId: number;
  date?: string; // YYYY-MM-DD format
  className?: string;
}

interface InsightData {
  date: string;
  summary: string;
  anomalies: Array<{
    metric: string;
    value: number;
    baseline_mean: number;
    baseline_std: number;
    z_score: number;
    severity: 'high' | 'medium';
    direction: 'increase' | 'decrease';
    message: string;
  }>;
  metrics: {
    call_count: number;
    avg_latency: number;
    avg_quality_score: number;
    error_rate: number;
  };
  trends: Record<string, 'up' | 'down' | 'stable'>;
}

export default function DailyInsight({ projectId, date, className }: DailyInsightProps) {
  const [insight, setInsight] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsight = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await insightsAPI.getDaily(projectId, date);
        setInsight(data);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load daily insights');
      } finally {
        setLoading(false);
      }
    };

    if (projectId) {
      fetchInsight();
    }
  }, [projectId, date]);

  if (loading) {
    return (
      <div className={clsx('rounded-xl border border-white/10 bg-ag-surface p-6', className)}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ag-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={clsx('rounded-xl border border-red-500/20 bg-red-500/5 p-6', className)}>
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  if (!insight) {
    return null;
  }

  const hasAnomalies = insight.anomalies.length > 0;
  const highSeverityAnomalies = insight.anomalies.filter((a) => a.severity === 'high');

  return (
    <div className={clsx('rounded-xl border border-white/10 bg-ag-surface p-6 shadow-xl', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ag-primary to-ag-primaryHover flex items-center justify-center shadow-lg shadow-ag-primary/40">
            <Sparkles className="h-5 w-5 text-ag-accent-light" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-ag-text">Daily Insight</h3>
            <p className="text-xs text-ag-muted">
              {new Date(insight.date).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
        {hasAnomalies ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-sm text-red-300">
              {highSeverityAnomalies.length > 0
                ? `${highSeverityAnomalies.length} High`
                : `${insight.anomalies.length} Anomalies`}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-emerald-300">All Normal</span>
          </div>
        )}
      </div>

      {/* AI Summary */}
      <div className="mb-6 p-4 bg-ag-bg border border-white/5 rounded-lg shadow-inner">
        <p className="text-sm text-ag-text/90 leading-relaxed italic">{insight.summary}</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-ag-bg border border-white/5 rounded-lg p-3">
          <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">API Calls</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ag-text">{insight.metrics.call_count}</span>
            {insight.trends.call_count && (
              <span>
                {insight.trends.call_count === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : insight.trends.call_count === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                ) : (
                  <span className="text-ag-muted/30">—</span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="bg-ag-bg border border-white/5 rounded-lg p-3">
          <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Avg Latency</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ag-text">
              {insight.metrics.avg_latency.toFixed(0)}ms
            </span>
            {insight.trends.avg_latency && (
              <span>
                {insight.trends.avg_latency === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-emerald-400" />
                ) : insight.trends.avg_latency === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-red-400" />
                ) : (
                  <span className="text-ag-muted/30">—</span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="bg-ag-bg border border-white/5 rounded-lg p-3">
          <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Quality Score</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ag-text">
              {insight.metrics.avg_quality_score.toFixed(1)}
            </span>
            {insight.trends.avg_quality_score && (
              <span>
                {insight.trends.avg_quality_score === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                ) : insight.trends.avg_quality_score === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-red-400" />
                ) : (
                  <span className="text-ag-muted/30">—</span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="bg-ag-bg border border-white/5 rounded-lg p-3">
          <div className="text-xs text-ag-muted mb-1 uppercase tracking-wider">Error Rate</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-ag-text">
              {(insight.metrics.error_rate * 100).toFixed(1)}%
            </span>
            {insight.trends.error_rate && (
              <span>
                {insight.trends.error_rate === 'down' ? (
                  <TrendingDown className="h-4 w-4 text-emerald-400" />
                ) : insight.trends.error_rate === 'up' ? (
                  <TrendingUp className="h-4 w-4 text-red-400" />
                ) : (
                  <span className="text-ag-muted/30">—</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Anomalies */}
      {hasAnomalies && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-ag-text uppercase tracking-widest">Detected Anomalies</h4>
          {insight.anomalies.map((anomaly, index) => (
            <div
              key={index}
              className={clsx(
                'p-3 rounded-lg border transition-all hover:bg-white/5',
                anomaly.severity === 'high'
                  ? 'bg-red-500/5 border-red-500/20'
                  : 'bg-amber-500/5 border-amber-500/20'
              )}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={clsx(
                    'h-5 w-5 mt-0.5 flex-shrink-0',
                    anomaly.severity === 'high' ? 'text-red-400' : 'text-amber-400'
                  )}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={clsx(
                        'text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider',
                        anomaly.severity === 'high'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-amber-500/20 text-amber-300'
                      )}
                    >
                      {anomaly.severity}
                    </span>
                    <span className="text-[10px] text-ag-muted/60 uppercase tracking-widest">Z-Score: {anomaly.z_score.toFixed(2)}</span>
                  </div>
                  <p className="text-sm text-ag-text">{anomaly.message}</p>
                  <div className="mt-2 text-xs text-ag-muted">
                    Value: {anomaly.value.toFixed(2)} | Baseline: {anomaly.baseline_mean.toFixed(2)} ±{' '}
                    {anomaly.baseline_std.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
