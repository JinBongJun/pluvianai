'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import JSONViewer from '@/components/ui/JSONViewer';
import { alertsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { ArrowLeft, CheckCircle, XCircle, Bell, Send, AlertTriangle } from 'lucide-react';
import { clsx } from 'clsx';

export default function AlertDetailPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const projectId = Number(params.projectId);
  const alertId = Number(params.alertId);
  
  const [alert, setAlert] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadAlert();
  }, [alertId, projectId, router]);

  const loadAlert = async () => {
    try {
      const data = await alertsAPI.get(alertId);
      setAlert(data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load alert:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, alertId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to load alert', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      } else if (error.response?.status === 404) {
        router.push(`/dashboard/${projectId}/alerts`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!confirm('Mark this alert as resolved?')) {
      return;
    }

    setResolving(true);
    try {
      const updated = await alertsAPI.resolve(alertId);
      setAlert(updated);
      toast.showToast('Alert marked as resolved', 'success');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to resolve alert:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, alertId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to resolve alert', 'error');
    } finally {
      setResolving(false);
    }
  };

  const handleSend = async () => {
    try {
      await alertsAPI.send(alertId);
      toast.showToast('Alert sent successfully', 'success');
      await loadAlert();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to send alert:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, alertId } });
        });
      }
      toast.showToast(error.response?.data?.detail || 'Failed to send alert', 'error');
    }
  };

  const getSeverityColor = (severity: string): 'error' | 'warning' | 'default' => {
    switch (severity) {
      case 'critical':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'default';
      default:
        return 'default';
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      drift: 'Drift Detection',
      cost_spike: 'Cost Anomaly',
      error: 'Error',
      timeout: 'Timeout',
      model_update: 'Model Update',
      quality_drop: 'Quality Drop',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="bg-ag-bg min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ag-accent border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!alert) {
    return (
      <DashboardLayout>
        <div className="bg-ag-bg min-h-screen">
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">Alert Not Found</h3>
            <p className="text-slate-400 mb-4">
              The alert you&apos;re looking for doesn&apos;t exist or you don&apos;t have access to it.
            </p>
            <Button onClick={() => router.push(`/dashboard/${projectId}/alerts`)}>
              Back to Alerts
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-ag-bg min-h-screen">
        <div className="space-y-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="ghost"
              onClick={() => router.push(`/dashboard/${projectId}/alerts`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Alerts
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-white">{alert.title}</h1>
              <p className="text-slate-400 mt-2">
                Created on {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={getSeverityColor(alert.severity)}>
              {alert.severity}
            </Badge>
            {alert.is_resolved ? (
              <Badge variant="success">
                <CheckCircle className="h-3 w-3 mr-1" />
                Resolved
              </Badge>
            ) : (
              <Badge variant="warning">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            )}
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="text-sm text-slate-400 mb-2">Alert Type</div>
            <div className="text-lg font-semibold text-white">
              {getAlertTypeLabel(alert.alert_type)}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="text-sm text-slate-400 mb-2">Notification Status</div>
            <div className="flex items-center gap-2">
              {alert.is_sent ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-lg font-semibold text-white">Sent</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-slate-400" />
                  <span className="text-lg font-semibold text-white">Not Sent</span>
                </>
              )}
            </div>
            {alert.sent_at && (
              <div className="text-xs text-slate-400 mt-2">
                {new Date(alert.sent_at).toLocaleString()}
              </div>
            )}
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
            <div className="text-sm text-slate-400 mb-2">Resolution Status</div>
            <div className="flex items-center gap-2">
              {alert.is_resolved ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-400" />
                  <span className="text-lg font-semibold text-white">Resolved</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-orange-400" />
                  <span className="text-lg font-semibold text-white">Unresolved</span>
                </>
              )}
            </div>
            {alert.resolved_at && (
              <div className="text-xs text-slate-400 mt-2">
                {new Date(alert.resolved_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Message */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Message</h2>
          <p className="text-slate-300 whitespace-pre-wrap">{alert.message}</p>
        </div>

        {/* Alert Data */}
        {alert.alert_data && (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Alert Data</h2>
            <JSONViewer data={alert.alert_data} searchable />
          </div>
        )}

        {/* Notification Channels */}
        {alert.notification_channels && alert.notification_channels.length > 0 && (
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl mb-6">
            <h2 className="text-lg font-semibold text-white mb-4">Notification Channels</h2>
            <div className="flex flex-wrap gap-2">
              {alert.notification_channels.map((channel: string, index: number) => (
                <Badge key={index} variant="default">
                  {channel}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-4">Actions</h2>
          <div className="flex gap-3">
            {!alert.is_sent && (
              <Button
                variant="secondary"
                onClick={handleSend}
                className="flex items-center gap-2"
              >
                <Send className="h-4 w-4" />
                Send Alert
              </Button>
            )}
            {!alert.is_resolved && (
              <Button
                onClick={handleResolve}
                disabled={resolving}
                className="flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                {resolving ? 'Resolving...' : 'Mark as Resolved'}
              </Button>
            )}
          </div>
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

