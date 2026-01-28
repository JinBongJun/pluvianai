'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { Shield, Users, CreditCard, Activity, AlertTriangle } from 'lucide-react';
import { adminAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function AdminPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await adminAPI.getCurrentUser();
        if (!user.is_superuser) {
          router.push('/dashboard');
          return;
        }
        setIsAdmin(true);
        
        // Load admin stats
        try {
          const adminStats = await adminAPI.getStats();
          setStats(adminStats);
        } catch (err) {
          // Stats might not be available
        }
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, [router]);

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
            <div className="flex items-center gap-3 mb-2">
              <Shield className="h-8 w-8 text-ag-accent" />
              <h1 className="text-4xl font-bold text-white">Admin Dashboard</h1>
            </div>
            <p className="text-slate-400 mt-2">Manage users, monitor system, and handle support requests</p>
          </div>

          {/* Stats Overview */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Total Users</p>
                    <p className="text-2xl font-bold text-white">{stats.total_users || 0}</p>
                  </div>
                  <Users className="h-8 w-8 text-ag-accent" />
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Active Projects</p>
                    <p className="text-2xl font-bold text-white">{stats.active_projects || 0}</p>
                  </div>
                  <Activity className="h-8 w-8 text-green-400" />
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Total Revenue</p>
                    <p className="text-2xl font-bold text-white">${stats.total_revenue?.toFixed(2) || '0.00'}</p>
                  </div>
                  <CreditCard className="h-8 w-8 text-blue-400" />
                </div>
              </div>

              <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400 mb-1">Alerts</p>
                    <p className="text-2xl font-bold text-white">{stats.open_alerts || 0}</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 text-yellow-400" />
                </div>
              </div>
            </div>
          )}

          {/* Admin Actions */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* User Management */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Management
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                View and manage users, handle support requests, and monitor user activity
              </p>
              <Button
                onClick={() => router.push('/admin/users')}
                className="w-full"
              >
                Manage Users
              </Button>
            </div>

            {/* Impersonation */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5" />
                User Impersonation
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Temporarily access user accounts for debugging and support (fully audited)
              </p>
              <Button
                onClick={() => router.push('/admin/impersonation')}
                variant="outline"
                className="w-full"
              >
                Start Impersonation
              </Button>
            </div>

            {/* Billing Management */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Billing Management
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                View subscription details, handle refunds, and manage billing issues
              </p>
              <Button
                onClick={() => router.push('/admin/billing')}
                variant="outline"
                className="w-full"
              >
                View Billing
              </Button>
            </div>

            {/* System Monitoring */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                <Activity className="h-5 w-5" />
                System Monitoring
              </h2>
              <p className="text-slate-400 text-sm mb-4">
                Monitor system health, performance metrics, and error rates
              </p>
              <Button
                onClick={() => router.push('/admin/monitoring')}
                variant="outline"
                className="w-full"
              >
                View Monitoring
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
