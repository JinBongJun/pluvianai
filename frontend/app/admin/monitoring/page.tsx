'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import { Activity, ArrowLeft, Server, Database, AlertTriangle, CheckCircle } from 'lucide-react';
import { adminAPI, healthAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import LoadingSpinner from '@/components/LoadingSpinner';

export default function AdminMonitoringPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const user = await adminAPI.getCurrentUser();
        if (!user.is_superuser) {
          router.push('/admin');
          return;
        }
        setIsAdmin(true);
        loadHealthStatus();
        loadSystemMetrics();
      } catch (error) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
    
    // Refresh metrics every 30 seconds
    const interval = setInterval(() => {
      if (isAdmin) {
        loadHealthStatus();
        loadSystemMetrics();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [router, isAdmin]);

  const loadHealthStatus = async () => {
    try {
      const health = await healthAPI.getHealth();
      setHealthStatus(health);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load health status:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
    }
  };

  const loadSystemMetrics = async () => {
    try {
      // Get admin stats for system overview
      const stats = await adminAPI.getStats();
      setSystemMetrics(stats);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load system metrics:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error);
        });
      }
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
      <div className="bg-ag-bg min-h-screen p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Activity className="h-8 w-8 text-purple-400" />
                  <h1 className="text-4xl font-bold text-white">System Monitoring</h1>
                </div>
                <p className="text-slate-400 mt-2">Monitor system health and performance metrics</p>
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

          {/* Health Status */}
          {healthStatus && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">API Status</span>
                  {healthStatus.status === 'healthy' ? (
                    <CheckCircle className="h-5 w-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-400" />
                  )}
                </div>
                <p className="text-2xl font-bold text-white capitalize">
                  {healthStatus.status || 'Unknown'}
                </p>
                <p className="text-xs text-slate-500 mt-1">API server health</p>
              </div>

              <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Database</span>
                  <Database className="h-5 w-5 text-blue-400" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {healthStatus.database === 'connected' ? 'Connected' : 'Disconnected'}
                </p>
                <p className="text-xs text-slate-500 mt-1">PostgreSQL connection</p>
              </div>

              <div className="bg-white/5 rounded-lg p-6 border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Redis</span>
                  <Server className="h-5 w-5 text-yellow-400" />
                </div>
                <p className="text-2xl font-bold text-white">
                  {healthStatus.redis === 'connected' ? 'Connected' : 'Disconnected'}
                </p>
                <p className="text-xs text-slate-500 mt-1">Cache connection</p>
              </div>
            </div>
          )}

          {/* System Metrics */}
          {systemMetrics && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">System Overview</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Total Users</p>
                  <p className="text-2xl font-bold text-white">{systemMetrics.total_users || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Active Projects</p>
                  <p className="text-2xl font-bold text-white">{systemMetrics.active_projects || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-white">
                    ${systemMetrics.total_revenue?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-1">Open Alerts</p>
                  <p className="text-2xl font-bold text-white">{systemMetrics.open_alerts || 0}</p>
                </div>
              </div>
            </div>
          )}

          {/* Monitoring Actions */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Monitoring Tools</h2>
            <p className="text-slate-400 text-sm mb-6">
              Access external monitoring and logging services
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-slate-800/50 rounded-lg border border-white/5">
                <h3 className="text-sm font-medium text-white mb-2">Sentry Error Tracking</h3>
                <p className="text-sm text-slate-400 mb-4">
                  View errors and performance issues in Sentry
                </p>
                <Button
                  onClick={() => window.open('https://sentry.io', '_blank')}
                  variant="outline"
                  size="sm"
                >
                  Open Sentry Dashboard
                </Button>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg border border-white/5">
                <h3 className="text-sm font-medium text-white mb-2">Application Logs</h3>
                <p className="text-sm text-slate-400 mb-4">
                  View application logs and system events
                </p>
                <p className="text-xs text-slate-500">
                  Log viewing interface coming soon
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
