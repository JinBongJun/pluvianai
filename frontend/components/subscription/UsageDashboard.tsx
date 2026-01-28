'use client';

import { useEffect, useState } from 'react';
import { billingAPI, subscriptionAPI } from '@/lib/api';
import { clsx } from 'clsx';
import { toFixedSafe } from '@/lib/format';
import { useRouter } from 'next/navigation';
import UpgradePrompt from './UpgradePrompt';

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
  const router = useRouter();
  const [usage, setUsage] = useState<any>(null);
  const [limits, setLimits] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      const [usageData, limitsData, subscriptionData] = await Promise.all([
        billingAPI.getUsage().catch(() => null),
        billingAPI.getLimits().catch(() => null),
        subscriptionAPI.getCurrent().catch(() => null),
      ]);

      if (usageData) {
        setUsage(usageData);
      }
      if (limitsData) {
        setLimits(limitsData);
      }
      // Fallback to subscription data if billing API fails
      if (!usageData && subscriptionData?.usage) {
        setUsage(subscriptionData.usage);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load usage:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading usage...</div>;
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${toFixedSafe(num / 1000000, 1)}M`;
    if (num >= 1000) return `${toFixedSafe(num / 1000, 1)}K`;
    return num.toString();
  };

  // Get plan type from limits or usage
  const planType = limits?.plan_type || usage?.plan_type || 'free';
  
  // Get limits from limits data or usage data
  const planLimits = limits?.limits || {};
  const softCaps = usage?.soft_caps || {};
  
  // Get current usage
  const currentUsage = {
    snapshots: usage?.snapshots || 0,
    judge_calls: usage?.judge_calls || 0,
    monthly_usage: usage?.monthly_usage || 0,
  };

  // Get limits (use soft_caps for snapshots and judge_calls)
  const snapshotLimit = softCaps?.snapshots || planLimits?.snapshots_per_month || 500;
  const judgeCallsLimit = softCaps?.judge_calls || planLimits?.judge_calls_per_month || 100;

  const metrics = [
    {
      key: 'snapshots',
      label: 'Snapshots',
      current: currentUsage.snapshots,
      limit: snapshotLimit,
      unlimited: snapshotLimit === -1,
    },
    {
      key: 'judge_calls',
      label: 'Judge Calls',
      current: currentUsage.judge_calls,
      limit: judgeCallsLimit,
      unlimited: judgeCallsLimit === -1,
    },
  ];

  const hasExceededLimit = metrics.some(
    (m) => !m.unlimited && m.current >= m.limit
  );
  const isNearLimit = metrics.some(
    (m) => !m.unlimited && m.current >= m.limit * 0.8
  );

  return (
    <>
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-ag-text mb-2">Usage Overview</h3>
          <p className="text-sm text-ag-muted">
            Current plan: <span className="font-medium capitalize">{planType}</span>
          </p>
        </div>

        {hasExceededLimit && (
          <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-red-300 mb-1">Quota Exceeded</h4>
                <p className="text-sm text-red-300">
                  You&apos;ve reached your plan limit. Upgrade to continue using AgentGuard.
                </p>
              </div>
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors text-sm font-medium"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        )}

        {isNearLimit && !hasExceededLimit && (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-amber-300 mb-1">Approaching Limit</h4>
                <p className="text-sm text-amber-200">
                  You&apos;re using over 80% of your plan limit. Consider upgrading.
                </p>
              </div>
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="px-4 py-2 bg-amber-500 text-black rounded-md hover:bg-amber-400 transition-colors text-sm font-medium"
              >
                Upgrade
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {metrics.map((metric) => {
            const percentage = metric.unlimited ? 0 : Math.min((metric.current / metric.limit) * 100, 100);
            const isExceeded = !metric.unlimited && metric.current >= metric.limit;
            const isNear = !metric.unlimited && metric.current >= metric.limit * 0.8;
            
            return (
              <div key={metric.key} className="bg-ag-surface rounded-lg border border-white/10 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-ag-text">
                    {metric.label}
                  </span>
                  <span className={clsx(
                    'text-sm font-medium',
                    isExceeded ? 'text-red-400' : isNear ? 'text-amber-300' : 'text-ag-muted'
                  )}>
                    {metric.unlimited ? (
                      <span className="text-emerald-400 font-medium">Unlimited</span>
                    ) : (
                      <>
                        {formatNumber(metric.current)} / {formatNumber(metric.limit)}
                      </>
                    )}
                  </span>
                </div>
                {!metric.unlimited && (
                  <>
                    <div className="w-full bg-white/10 rounded-full h-2 mb-2">
                      <div
                        className={clsx(
                          'h-2 rounded-full transition-all',
                          isExceeded ? 'bg-red-500' : isNear ? 'bg-yellow-500' : 'bg-ag-primary'
                        )}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    {isExceeded && (
                      <div className="text-xs text-red-400 mt-1">
                        Limit exceeded. Upgrade to continue.
                      </div>
                    )}
                    {isNear && !isExceeded && (
                      <div className="text-xs text-yellow-400 mt-1">
                        Near limit. Consider upgrading.
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <UpgradePrompt
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={planType}
        requiredPlan="pro"
        feature="Higher usage limits"
      />
    </>
  );
}

