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
      console.error('Failed to load alert:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load alert', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      } else if (error.response?.status === 404) {
        router.push(`/dashboard/${projectId}`);
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
      console.error('Failed to resolve alert:', error);
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
      console.error('Failed to send alert:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to send alert', 'error');
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'danger';
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
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!alert) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Alert Not Found</h3>
          <p className="text-gray-600 mb-4">The alert you're looking for doesn't exist or you don't have access to it.</p>
          <Button onClick={() => router.push(`/dashboard/${projectId}`)}>
            Back to Project
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="secondary"
              onClick={() => router.push(`/dashboard/${projectId}`)}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{alert.title}</h1>
              <p className="text-sm text-gray-600 mt-1">
                Created on {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={getSeverityColor(alert.severity)}>
              {alert.severity}
            </Badge>
            {alert.is_resolved ? (
              <Badge variant="success">Resolved</Badge>
            ) : (
              <Badge variant="default">Active</Badge>
            )}
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Alert Type</div>
            <div className="text-lg font-semibold text-gray-900">
              {getAlertTypeLabel(alert.alert_type)}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Notification Status</div>
            <div className="flex items-center gap-2">
              {alert.is_sent ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg font-semibold text-gray-900">Sent</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-gray-400" />
                  <span className="text-lg font-semibold text-gray-900">Not Sent</span>
                </>
              )}
            </div>
            {alert.sent_at && (
              <div className="text-xs text-gray-500 mt-1">
                {new Date(alert.sent_at).toLocaleString()}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Resolution Status</div>
            <div className="flex items-center gap-2">
              {alert.is_resolved ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="text-lg font-semibold text-gray-900">Resolved</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-orange-600" />
                  <span className="text-lg font-semibold text-gray-900">Unresolved</span>
                </>
              )}
            </div>
            {alert.resolved_at && (
              <div className="text-xs text-gray-500 mt-1">
                {new Date(alert.resolved_at).toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* Message */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Message</h2>
          <p className="text-gray-700 whitespace-pre-wrap">{alert.message}</p>
        </div>

        {/* Alert Data */}
        {alert.alert_data && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert Data</h2>
            <JSONViewer data={alert.alert_data} searchable />
          </div>
        )}

        {/* Notification Channels */}
        {alert.notification_channels && alert.notification_channels.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Channels</h2>
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
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
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
    </DashboardLayout>
  );
}

