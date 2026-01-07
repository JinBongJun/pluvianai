'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import UsageDashboard from '@/components/subscription/UsageDashboard';
import PlanSelector from '@/components/subscription/PlanSelector';
import { subscriptionAPI } from '@/lib/api';
import Button from '@/components/ui/Button';

export default function BillingPage() {
  const router = useRouter();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadSubscription();
  }, [router]);

  const loadSubscription = async () => {
    try {
      const data = await subscriptionAPI.getCurrent();
      setSubscription(data);
    } catch (error) {
      console.error('Failed to load subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? It will remain active until the end of the billing period.')) {
      return;
    }

    try {
      await subscriptionAPI.cancel();
      await loadSubscription();
      alert('Subscription cancelled. It will remain active until the end of the billing period.');
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      alert('Failed to cancel subscription. Please try again.');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Billing & Subscription</h1>
          <p className="text-gray-600 mt-1">Manage your subscription and usage</p>
        </div>

        {/* Current Plan */}
        {subscription && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Current Plan</h2>
                <p className="text-gray-600 mt-1">
                  {subscription.plan_type.charAt(0).toUpperCase() + subscription.plan_type.slice(1)} - ${subscription.price_per_month}/month
                </p>
              </div>
              {subscription.status === 'active' && subscription.plan_type !== 'free' && (
                <Button variant="danger" onClick={handleCancel}>
                  Cancel Subscription
                </Button>
              )}
            </div>
            {subscription.current_period_end && (
              <p className="text-sm text-gray-600">
                Next billing date: {new Date(subscription.current_period_end).toLocaleDateString()}
              </p>
            )}
          </div>
        )}

        {/* Usage Dashboard */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <UsageDashboard />
        </div>

        {/* Plan Selector */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Available Plans</h2>
          <PlanSelector 
            currentPlan={subscription?.plan_type}
            onSelectPlan={async (planType) => {
              try {
                const result = await subscriptionAPI.upgrade(planType);
                if (result.checkout_url) {
                  window.location.href = result.checkout_url;
                }
              } catch (error) {
                console.error('Failed to upgrade:', error);
                alert('Failed to initiate upgrade. Please try again.');
              }
            }}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}


