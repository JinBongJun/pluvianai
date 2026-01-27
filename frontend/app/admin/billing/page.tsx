'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { CreditCard, ArrowLeft, DollarSign, TrendingUp, Users } from 'lucide-react';
import { adminAPI, billingAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function AdminBillingPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [billingStats, setBillingStats] = useState<any>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await adminAPI.getCurrentUser();
        if (!user.is_superuser) {
          router.push('/admin');
          return;
        }
        setIsAdmin(true);
        loadBillingStats();
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [router]);

  const loadBillingStats = async () => {
    try {
      // Get admin stats which includes revenue
      const stats = await adminAPI.getStats();
      setBillingStats(stats);
    } catch (error: any) {
      toast.showToast(error.response?.data?.detail || 'Failed to load billing stats', 'error');
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <LoadingSpinner />
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="bg-[#000314] min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <CreditCard className="h-8 w-8 text-purple-400" />
                  <h1 className="text-4xl font-bold text-white">Billing Management</h1>
                </div>
                <p className="text-slate-400 mt-2">View subscription details and manage billing</p>
              </div>
              <Button
                onClick={() => router.push('/admin')}
                variant="outline"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </div>
          </div>

          {/* Billing Stats */}
          {billingStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Total Revenue</span>
                  <DollarSign className="h-5 w-5 text-green-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  ${billingStats.total_revenue?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-slate-500 mt-1">From active subscriptions</p>
              </div>

              <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Active Subscriptions</span>
                  <Users className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  {billingStats.active_subscriptions || 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">Paying customers</p>
              </div>

              <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">MRR</span>
                  <TrendingUp className="h-5 w-5 text-purple-400" />
                </div>
                <p className="text-3xl font-bold text-white">
                  ${billingStats.mrr?.toFixed(2) || billingStats.total_revenue?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Monthly recurring revenue</p>
              </div>
            </div>
          )}

          {/* Billing Actions */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Billing Operations</h2>
            <p className="text-slate-400 text-sm mb-6">
              Manage subscriptions, handle refunds, and view billing history
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-white/5">
                <h3 className="text-sm font-medium text-white mb-2">Stripe Integration</h3>
                <p className="text-sm text-slate-400 mb-4">
                  View and manage subscriptions through Stripe dashboard
                </p>
                <Button
                  onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
                  variant="outline"
                  size="sm"
                >
                  Open Stripe Dashboard
                </Button>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg border border-white/5">
                <h3 className="text-sm font-medium text-white mb-2">Subscription Management</h3>
                <p className="text-sm text-slate-400 mb-4">
                  View all active subscriptions and their details
                </p>
                <p className="text-xs text-slate-500">
                  Subscription management features coming soon
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
