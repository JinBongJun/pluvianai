'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react';

interface Metrics {
  total_requests: number;
  error_rate: number;
  avg_latency: number;
  active_users: number;
}

export function MonitoringWidget() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        // Fetch metrics from Prometheus via backend proxy
        // In a real implementation, you'd have a backend endpoint that queries Prometheus
        const response = await fetch('/api/v1/monitoring/metrics');
        if (!response.ok) {
          throw new Error('Failed to fetch metrics');
        }
        const data = await response.json();
        setMetrics(data);
        setError(null);
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to fetch metrics:', err);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(err as Error);
          });
        }
        setError('Unable to load metrics');
      } finally {
        setLoading(false);
      }
    };

    // Fetch immediately
    fetchMetrics();

    // Update every 10 seconds
    const interval = setInterval(fetchMetrics, 10000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-ag-text">시스템 상태</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-20">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-ag-accent"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-ag-text">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            시스템 상태
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ag-muted">{error || '메트릭을 불러올 수 없습니다'}</p>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'text-emerald-400';
    if (value <= thresholds.warning) return 'text-amber-400';
    return 'text-red-400';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2 text-ag-text">
          <Activity className="h-4 w-4 text-ag-accent" />
          시스템 상태
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-ag-muted">
              <span className="text-xs">요청 수</span>
              <TrendingUp className="h-3 w-3" />
            </div>
            <p className="text-lg font-semibold text-ag-text">{metrics.total_requests.toLocaleString()}</p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-ag-muted">
              <span className="text-xs">에러율</span>
              <AlertCircle 
                className={`h-3 w-3 ${getStatusColor(metrics.error_rate, { good: 1, warning: 5 })}`} 
              />
            </div>
            <p className={`text-lg font-semibold ${getStatusColor(metrics.error_rate, { good: 1, warning: 5 })}`}>
              {metrics.error_rate.toFixed(2)}%
            </p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-ag-muted">
              <span className="text-xs">응답 시간</span>
              <Activity className="h-3 w-3" />
            </div>
            <p className={`text-lg font-semibold ${getStatusColor(metrics.avg_latency, { good: 500, warning: 1000 })}`}>
              {metrics.avg_latency.toFixed(0)}ms
            </p>
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center justify-between text-ag-muted">
              <span className="text-xs">활성 사용자</span>
              <CheckCircle className="h-3 w-3 text-emerald-400" />
            </div>
            <p className="text-lg font-semibold text-ag-text">{metrics.active_users}</p>
          </div>
        </div>
        
        <div className="mt-4 pt-4 border-t border-white/10">
          <a 
            href="/settings/monitoring" 
            className="text-xs text-ag-accent hover:text-ag-accentLight transition-colors"
          >
            자세한 모니터링 보기 →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
