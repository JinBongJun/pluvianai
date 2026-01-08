'use client';

import { useEffect, useState } from 'react';
import { subscriptionAPI } from '@/lib/api';
import { clsx } from 'clsx';

interface UsageMetric {
  current: number;
  limit: number;
  percentage: number;
  unlimited: boolean;
}

interface UsageDashboardProps {
  userId?: number;
}

export default function UsageDashboard({ userId }: UsageDashboardProps) {
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const data = await subscriptionAPI.getCurrent();
      setUsage(data.usage);
    } catch (error) {
      console.error('Failed to load usage:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading usage...</div>;
  }

  if (!usage || !usage.metrics) {
    return <div className="text-center py-4 text-gray-500">No usage data available</div>;
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getMetricLabel = (key: string) => {
    const labels: Record<string, string> = {
      api_calls: 'API Calls',
      projects: 'Projects',
      team_members: 'Team Members',
    };
    return labels[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Overview</h3>
        <div className="text-sm text-gray-600 mb-4">
          Period: {new Date(usage.period_start).toLocaleDateString()} - {new Date(usage.period_end).toLocaleDateString()}
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(usage.metrics).map(([key, metric]: [string, any]) => {
          const percentage = metric.unlimited ? 0 : Math.min((metric.current / metric.limit) * 100, 100);
          const isNearLimit = percentage >= 80 && !metric.unlimited;
          
          return (
            <div key={key} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">
                  {getMetricLabel(key)}
                </span>
                <span className="text-sm text-gray-600">
                  {metric.unlimited ? (
                    <span className="text-green-600 font-medium">Unlimited</span>
                  ) : (
                    <>
                      {formatNumber(metric.current)} / {formatNumber(metric.limit)}
                    </>
                  )}
                </span>
              </div>
              {!metric.unlimited && (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                    <div
                      className={clsx(
                        'h-2 rounded-full transition-all',
                        isNearLimit ? 'bg-red-500' : 'bg-black'
                      )}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  {isNearLimit && (
                    <div className="text-xs text-red-600 mt-1">
                      Near limit. Consider upgrading your plan.
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

