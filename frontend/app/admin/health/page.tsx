'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { toFixedSafe } from '@/lib/format';
import { CheckCircle, XCircle, AlertTriangle, Activity, Database, RefreshCw, Loader2, Server } from 'lucide-react';
import { clsx } from 'clsx';

interface HealthStatus {
  status: string;
  app: string;
  version: string;
  environment?: string;
  timestamp?: string;
  database?: {
    status: string;
    connection: string;
    error?: string;
  };
  redis?: {
    status: string;
    connection: string;
    error?: string;
  };
  system?: {
    cpu_percent?: number;
    memory_percent?: number;
    memory_available_mb?: number;
    disk_percent?: number;
    disk_free_gb?: number;
    status?: string;
    reason?: string;
    error?: string;
  };
  external_apis?: {
    sentry?: string;
  };
  warnings?: string[];
}

export default function HealthDashboardPage() {
  const router = useRouter();
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadHealthStatus();

    // Auto refresh every 30 seconds
    if (autoRefresh) {
      const interval = setInterval(loadHealthStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, router]);

  const loadHealthStatus = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`${API_URL}/api/v1/health/detailed`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch health status');
      }
      
      const data = await response.json();
      setHealthStatus(data);
    } catch (error: any) {
      console.error('Failed to load health status:', error);
      setHealthStatus({
        status: 'error',
        app: 'Unknown',
        version: 'Unknown',
        database: { status: 'error', connection: 'error' },
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-400';
      case 'degraded':
        return 'text-yellow-400';
      case 'unhealthy':
      case 'error':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return <Badge variant="success">Healthy</Badge>;
      case 'degraded':
        return <Badge variant="warning">Degraded</Badge>;
      case 'unhealthy':
      case 'error':
        return <Badge variant="error">Unhealthy</Badge>;
      case 'not_configured':
        return <Badge variant="warning">Not Configured</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  if (loading && !healthStatus) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-ag-accent" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-ag-bg min-h-screen">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white">System Health</h1>
              <p className="text-slate-400 mt-2">Monitor system status and resources</p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={clsx(autoRefresh && 'bg-ag-accent/20')}
              >
                Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadHealthStatus}
                disabled={loading}
              >
                <RefreshCw className={clsx('h-4 w-4 mr-2', loading && 'animate-spin')} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Overall Status */}
        {healthStatus && (
          <div className={clsx(
            "mb-6 relative rounded-2xl border backdrop-blur-sm p-6 shadow-2xl",
            healthStatus.status === "healthy" ? "border-green-500/30 bg-green-500/10" :
            healthStatus.status === "degraded" ? "border-yellow-500/30 bg-yellow-500/10" :
            "border-red-500/30 bg-red-500/10"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {healthStatus.status === "healthy" ? (
                  <CheckCircle className="h-8 w-8 text-green-400" />
                ) : healthStatus.status === "degraded" ? (
                  <AlertTriangle className="h-8 w-8 text-yellow-400" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-400" />
                )}
                <div>
                  <h2 className={clsx("text-2xl font-bold", getStatusColor(healthStatus.status))}>
                    {healthStatus.status.toUpperCase()}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">
                    {healthStatus.app} v{healthStatus.version}
                    {healthStatus.environment && ` • ${healthStatus.environment}`}
                  </p>
                </div>
              </div>
              {healthStatus.timestamp && (
                <div className="text-right">
                  <div className="text-xs text-slate-400">Last Updated</div>
                  <div className="text-sm text-white">
                    {new Date(healthStatus.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
            {healthStatus.warnings && healthStatus.warnings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5" />
                  <div>
                    <div className="font-medium text-yellow-400 mb-1">Warnings</div>
                    <ul className="text-sm text-yellow-300 space-y-1">
                      {healthStatus.warnings.map((warning, idx) => (
                        <li key={idx}>• {warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Service Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Database */}
          {healthStatus?.database && (
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Database className="h-6 w-6 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Database</h3>
                </div>
                {getStatusBadge(healthStatus.database.status)}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Connection:</span>
                  <span className="text-white">{healthStatus.database.connection}</span>
                </div>
                {healthStatus.database.error && (
                  <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                    {healthStatus.database.error}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Redis */}
          {healthStatus?.redis && (
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Activity className="h-6 w-6 text-red-400" />
                  <h3 className="text-lg font-semibold text-white">Redis</h3>
                </div>
                {getStatusBadge(healthStatus.redis.status)}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Connection:</span>
                  <span className="text-white">{healthStatus.redis.connection}</span>
                </div>
                {healthStatus.redis.error && (
                  <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                    {healthStatus.redis.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* System Resources */}
        {healthStatus?.system && healthStatus.system.cpu_percent !== undefined && (
          <div className="mb-6 relative rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Server className="h-6 w-6 text-ag-accent" />
              <h3 className="text-lg font-semibold text-white">System Resources</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* CPU */}
              <div>
                <div className="text-sm text-slate-400 mb-2">CPU Usage</div>
                <div className={clsx(
                  "text-2xl font-bold mb-2",
                  (healthStatus.system.cpu_percent || 0) > 90 ? 'text-red-400' :
                  (healthStatus.system.cpu_percent || 0) > 70 ? 'text-yellow-400' :
                  'text-green-400'
                )}>
                  {toFixedSafe(healthStatus.system.cpu_percent || 0, 1)}%
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      (healthStatus.system.cpu_percent || 0) > 90 ? 'bg-red-500' :
                      (healthStatus.system.cpu_percent || 0) > 70 ? 'bg-yellow-500' :
                      'bg-green-500'
                    )}
                    style={{ width: `${healthStatus.system.cpu_percent || 0}%` }}
                  />
                </div>
              </div>

              {/* Memory */}
              <div>
                <div className="text-sm text-slate-400 mb-2">Memory Usage</div>
                <div className={clsx(
                  "text-2xl font-bold mb-2",
                  (healthStatus.system.memory_percent || 0) > 90 ? 'text-red-400' :
                  (healthStatus.system.memory_percent || 0) > 70 ? 'text-yellow-400' :
                  'text-green-400'
                )}>
                  {toFixedSafe(healthStatus.system.memory_percent || 0, 1)}%
                </div>
                <div className="text-xs text-slate-400">
                  {toFixedSafe(healthStatus.system.memory_available_mb || 0, 0)} MB available
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2 mt-1">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      (healthStatus.system.memory_percent || 0) > 90 ? 'bg-red-500' :
                      (healthStatus.system.memory_percent || 0) > 70 ? 'bg-yellow-500' :
                      'bg-blue-500'
                    )}
                    style={{ width: `${healthStatus.system.memory_percent || 0}%` }}
                  />
                </div>
              </div>

              {/* Disk */}
              <div>
                <div className="text-sm text-slate-400 mb-2">Disk Usage</div>
                <div className={clsx(
                  "text-2xl font-bold mb-2",
                  (healthStatus.system.disk_percent || 0) > 90 ? 'text-red-400' :
                  (healthStatus.system.disk_percent || 0) > 70 ? 'text-yellow-400' :
                  'text-green-400'
                )}>
                  {toFixedSafe(healthStatus.system.disk_percent || 0, 1)}%
                </div>
                <div className="text-xs text-slate-400">
                  {toFixedSafe(healthStatus.system.disk_free_gb || 0, 1)} GB free
                </div>
                <div className="w-full bg-slate-700/50 rounded-full h-2 mt-1">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      (healthStatus.system.disk_percent || 0) > 90 ? 'bg-red-500' :
                      (healthStatus.system.disk_percent || 0) > 70 ? 'bg-yellow-400' :
                      'bg-green-500'
                    )}
                    style={{ width: `${healthStatus.system.disk_percent || 0}%` }}
                  />
                </div>
              </div>

              {/* External APIs */}
              {healthStatus.external_apis && (
                <div>
                  <div className="text-sm text-slate-400 mb-2">External Services</div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">Sentry</span>
                      <Badge variant={healthStatus.external_apis.sentry === 'configured' ? 'success' : 'warning'}>
                        {healthStatus.external_apis.sentry || 'unknown'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* System Unavailable Message */}
        {healthStatus?.system && healthStatus.system.status === 'unavailable' && (
          <div className="mb-6 relative rounded-2xl border border-yellow-500/30 bg-yellow-500/10 backdrop-blur-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-400" />
              <div>
                <h3 className="text-lg font-semibold text-yellow-400">System Metrics Unavailable</h3>
                <p className="text-sm text-yellow-300 mt-1">
                  {healthStatus.system.reason || 'System resource monitoring is not available'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
