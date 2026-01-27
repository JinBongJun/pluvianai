'use client';

import { useEffect, useState } from 'react';
import { dashboardAPI } from '@/lib/api';
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown } from 'lucide-react';

interface Metrics {
  period: string;
  period_start: string;
  period_end: string;
  api_calls: {
    total: number;
    successful: number;
    errors: number;
    error_rate: number;
    avg_latency_ms: number | null;
  };
  quality: {
    avg_score: number | null;
    min_score: number | null;
    max_score: number | null;
    trend: 'up' | 'down' | 'stable' | null;
    total_evaluations: number;
  };
  drift: {
    total_detections: number;
    critical_detections: number;
  };
  cost: {
    total: number;
    avg_per_day: number;
  };
  recent_alerts: Array<{
    id: number;
    type: string;
    severity: string;
    title: string;
    created_at: string;
  }>;
}

interface RealTimeMetricsProps {
  projectId: number;
  period?: '24h' | '7d' | '30d';
}

export default function RealTimeMetrics({ projectId, period = '24h' }: RealTimeMetricsProps) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const loadMetrics = async () => {
      try {
        const data = await dashboardAPI.getMetrics(projectId, period);
        setMetrics(data);
        setError(null);
      } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load metrics:', err);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(err as Error, { extra: { projectId } });
          });
        }
        setError(err.message || 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    };

    // Initial load
    loadMetrics();

    // Try SSE first, fallback to polling
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const sseUrl = `${apiUrl}/api/v1/projects/${projectId}/dashboard/stream`;
      
      eventSource = new EventSource(sseUrl, {
        withCredentials: true,
      });

      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data);
          if (eventData.type === 'metrics' && eventData.data) {
            setMetrics(eventData.data);
            setError(null);
          } else if (eventData.type === 'error') {
            if (process.env.NODE_ENV === 'development') {
              console.error('SSE error:', eventData.data);
            }
            // Fallback to polling on error
            if (!pollInterval) {
              pollInterval = setInterval(loadMetrics, 5000);
            }
          }
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        eventSource?.close();
        // Fallback to polling
        if (!pollInterval) {
          pollInterval = setInterval(loadMetrics, 5000);
        }
      };
    } catch (err) {
      console.warn('SSE not available, using polling:', err);
      // Fallback to polling
      pollInterval = setInterval(loadMetrics, 5000);
    }

    return () => {
      eventSource?.close();
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [projectId, period]);

  if (loading && !metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-4 animate-pulse">
            <div className="h-4 bg-slate-700 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-slate-700 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
        Error loading metrics: {error}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const getTrendIcon = (trend: string | null) => {
    if (trend === 'up') return <TrendingUp className="w-4 h-4 text-green-400" />;
    if (trend === 'down') return <TrendingDown className="w-4 h-4 text-red-400" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Quality Score */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-400">Quality Score</h3>
          {getTrendIcon(metrics.quality.trend)}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">
            {metrics.quality.avg_score !== null ? metrics.quality.avg_score.toFixed(1) : 'N/A'}
          </span>
          {metrics.quality.trend && (
            <span className={`text-xs ${
              metrics.quality.trend === 'up' ? 'text-green-400' : 
              metrics.quality.trend === 'down' ? 'text-red-400' : 
              'text-slate-400'
            }`}>
              {metrics.quality.trend === 'up' ? '↑' : metrics.quality.trend === 'down' ? '↓' : '→'}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {metrics.quality.total_evaluations} evaluations
        </p>
      </div>

      {/* API Calls */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-400">API Calls</h3>
        </div>
        <div className="text-2xl font-bold text-white">{metrics.api_calls.total.toLocaleString()}</div>
        <div className="flex items-center gap-4 mt-2 text-xs">
          <span className="text-green-400">{metrics.api_calls.successful.toLocaleString()} successful</span>
          {metrics.api_calls.errors > 0 && (
            <span className="text-red-400">{metrics.api_calls.errors} errors</span>
          )}
        </div>
        {metrics.api_calls.avg_latency_ms && (
          <p className="text-xs text-slate-500 mt-1">
            Avg latency: {metrics.api_calls.avg_latency_ms.toFixed(0)}ms
          </p>
        )}
      </div>

      {/* Error Rate */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-400">Error Rate</h3>
        </div>
        <div className={`text-2xl font-bold ${
          metrics.api_calls.error_rate > 5 ? 'text-red-400' :
          metrics.api_calls.error_rate > 1 ? 'text-yellow-400' :
          'text-green-400'
        }`}>
          {metrics.api_calls.error_rate.toFixed(2)}%
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {metrics.api_calls.errors} of {metrics.api_calls.total} calls
        </p>
      </div>

      {/* Drift Detections */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-400">Drift Detections</h3>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-bold ${
            metrics.drift.critical_detections > 0 ? 'text-red-400' :
            metrics.drift.total_detections > 0 ? 'text-yellow-400' :
            'text-green-400'
          }`}>
            {metrics.drift.total_detections}
          </span>
        </div>
        {metrics.drift.critical_detections > 0 && (
          <p className="text-xs text-red-400 mt-1">
            {metrics.drift.critical_detections} critical
          </p>
        )}
      </div>

      {/* Cost */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 md:col-span-2 lg:col-span-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-slate-400">Cost</h3>
        </div>
        <div className="flex items-baseline gap-4">
          <div>
            <span className="text-2xl font-bold text-white">${metrics.cost.total.toFixed(4)}</span>
            <p className="text-xs text-slate-500 mt-1">Total ({period})</p>
          </div>
          <div>
            <span className="text-lg font-semibold text-slate-300">${metrics.cost.avg_per_day.toFixed(4)}</span>
            <p className="text-xs text-slate-500 mt-1">Avg per day</p>
          </div>
        </div>
      </div>
    </div>
  );
}
