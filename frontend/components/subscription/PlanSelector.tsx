'use client';

import { useState, useEffect } from 'react';
import { subscriptionAPI } from '@/lib/api';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Check, X } from 'lucide-react';
import { clsx } from 'clsx';
import { toFixedSafe } from '@/lib/format';
import posthog from 'posthog-js';

interface Plan {
  plan_type: string;
  price: number;
  limits: {
    projects: number;
    api_calls_per_month: number;
    team_members_per_project: number;
    data_retention_days: number;
  };
  features: Record<string, any>;
}

interface PlanSelectorProps {
  currentPlan?: string;
  onSelectPlan?: (planType: string) => void;
}

export default function PlanSelector({ currentPlan, onSelectPlan }: PlanSelectorProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await subscriptionAPI.getPlans();
      setPlans(data);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load plans:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatLimit = (limit: number) => {
    if (limit === -1) return 'Unlimited';
    if (limit >= 1000000) return `${toFixedSafe(limit / 1000000, 0)}M`;
    if (limit >= 1000) return `${toFixedSafe(limit / 1000, 0)}K`;
    return limit.toString();
  };

  const getFeatureValue = (features: Record<string, any>, key: string) => {
    const value = features[key];
    if (value === true) return true;
    if (value === false) return false;
    if (typeof value === 'string') return value;
    return false;
  };

  const handleUpgrade = async (planType: string) => {
    if (onSelectPlan) {
      onSelectPlan(planType);
    } else {
      try {
        const result = await subscriptionAPI.upgrade(planType);
        
        // Track upgrade event
        posthog.capture('free_to_pro_upgrade', {
          from_plan: currentPlan,
          to_plan: planType,
          has_checkout_url: !!result.checkout_url,
        });
        
        if (result.checkout_url) {
          window.location.href = result.checkout_url;
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to upgrade:', error);
        } else {
          import('@sentry/nextjs').then((Sentry) => {
            Sentry.captureException(error as Error, { extra: { planType } });
          });
        }
      }
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading plans...</div>;
  }

  const popularPlan = 'startup';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
      {plans.map((plan) => {
        const isCurrent = plan.plan_type === currentPlan;
        const isPopular = plan.plan_type === popularPlan;
        
        return (
          <div
            key={plan.plan_type}
            className={clsx(
              'relative bg-ag-surface rounded-lg border-2 p-6 flex flex-col',
              isPopular ? 'border-ag-accent' : 'border-white/10',
              isCurrent && 'ring-2 ring-ag-accent'
            )}
          >
            {isPopular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge variant="success" size="sm">Most Popular</Badge>
              </div>
            )}
            
            <div className="mb-4">
              <h3 className="text-xl font-bold text-ag-text capitalize mb-1">
                {plan.plan_type}
              </h3>
              <div className="flex items-baseline">
                <span className="text-3xl font-bold text-ag-text">${plan.price}</span>
                <span className="text-ag-muted ml-1">/month</span>
              </div>
            </div>

            <div className="flex-1 space-y-3 mb-6">
              <div className="text-sm">
                <div className="text-ag-muted">Projects: {formatLimit(plan.limits.projects)}</div>
                <div className="text-ag-muted">API Calls: {formatLimit(plan.limits.api_calls_per_month)}/mo</div>
                <div className="text-ag-muted">Team Members: {formatLimit(plan.limits.team_members_per_project)}</div>
                <div className="text-ag-muted">Retention: {plan.limits.data_retention_days} days</div>
              </div>

              <div className="border-t border-white/10 pt-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {getFeatureValue(plan.features, 'multi_model_comparison') ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-gray-700">Multi-model Comparison</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {getFeatureValue(plan.features, 'agent_chain_profiler') ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-gray-700">Agent Chain Profiler</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {plan.features.alerts ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-gray-700">Alerts</span>
                </div>
              </div>
            </div>

            <Button
              variant={isCurrent ? 'secondary' : 'primary'}
              className="w-full"
              onClick={() => !isCurrent && handleUpgrade(plan.plan_type)}
              disabled={isCurrent}
            >
              {isCurrent ? 'Current Plan' : 'Upgrade'}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

