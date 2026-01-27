'use client';

import { useEffect, useState } from 'react';
import { notificationSettingsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';

interface NotificationSettings {
  id?: number;
  project_id: number;
  user_id: number;
  email_enabled: boolean;
  slack_enabled: boolean;
  slack_webhook_url: string | null;
  alert_types: string[];
  severity_threshold: 'low' | 'medium' | 'high' | 'critical';
  min_interval_minutes: number;
  quality_score_threshold: number | null;
  error_rate_threshold: number | null;
  drift_threshold: number | null;
}

interface NotificationSettingsProps {
  projectId: number;
}

export default function NotificationSettings({ projectId }: NotificationSettingsProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadSettings();
  }, [projectId]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await notificationSettingsAPI.getSettings(projectId);
      setSettings(data);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load notification settings:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to load notification settings',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setSaving(true);
      await notificationSettingsAPI.updateSettings(projectId, settings);
      toast.showToast('Notification settings saved successfully', 'success');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to save notification settings:', error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId } });
        });
      }
      toast.showToast(
        error.response?.data?.detail || error.message || 'Failed to save notification settings',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel: 'email' | 'slack') => {
    try {
      setTesting(channel);
      await notificationSettingsAPI.sendTest(projectId, channel);
      toast.showToast(`Test ${channel} notification sent successfully`, 'success');
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`Failed to send test ${channel} notification:`, error);
      } else {
        import('@sentry/nextjs').then((Sentry) => {
          Sentry.captureException(error as Error, { extra: { projectId, channel } });
        });
      }
      toast.showToast(
        `Failed to send test ${channel} notification: ${
          error.response?.data?.detail || error.message || ''
        }`,
        'error',
      );
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-slate-700 rounded w-1/4"></div>
          <div className="h-10 bg-slate-700 rounded"></div>
          <div className="h-10 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50">
        <p className="text-slate-400">Failed to load notification settings</p>
      </div>
    );
  }

  const alertTypeOptions = [
    { value: 'drift', label: 'Drift Detection' },
    { value: 'cost_spike', label: 'Cost Spike' },
    { value: 'error', label: 'Error Rate' },
    { value: 'quality_drop', label: 'Quality Drop' },
    { value: 'timeout', label: 'Timeout' },
  ];

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700/50 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white mb-2">Notification Settings</h2>
        <p className="text-sm text-slate-400">Configure how you receive alerts for this project</p>
      </div>

      {/* Channel Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Notification Channels</h3>

        {/* Email */}
        <div className="flex items-center justify-between p-4 bg-slate-900/50 rounded-lg border border-slate-700/50">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="email_enabled"
                checked={settings.email_enabled}
                onChange={(e) => setSettings({ ...settings, email_enabled: e.target.checked })}
                className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
              />
              <label htmlFor="email_enabled" className="text-white font-medium">
                Email Notifications
              </label>
            </div>
            <p className="text-sm text-slate-400 mt-1">Receive alerts via email</p>
          </div>
          {settings.email_enabled && (
            <Button
              onClick={() => handleTest('email')}
              disabled={testing === 'email'}
              variant="secondary"
              size="sm"
            >
              {testing === 'email' ? 'Sending...' : 'Test'}
            </Button>
          )}
        </div>

        {/* Slack */}
        <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700/50 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="slack_enabled"
                  checked={settings.slack_enabled}
                  onChange={(e) => setSettings({ ...settings, slack_enabled: e.target.checked })}
                  className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
                />
                <label htmlFor="slack_enabled" className="text-white font-medium">
                  Slack Notifications
                </label>
              </div>
              <p className="text-sm text-slate-400 mt-1">Receive alerts via Slack webhook</p>
            </div>
            {settings.slack_enabled && (
              <Button
                onClick={() => handleTest('slack')}
                disabled={testing === 'slack' || !settings.slack_webhook_url}
                variant="secondary"
                size="sm"
              >
                {testing === 'slack' ? 'Sending...' : 'Test'}
              </Button>
            )}
          </div>
          {settings.slack_enabled && (
            <div>
              <label htmlFor="slack_webhook_url" className="block text-sm font-medium text-slate-300 mb-1">
                Slack Webhook URL
              </label>
              <input
                type="text"
                id="slack_webhook_url"
                value={settings.slack_webhook_url || ''}
                onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
                placeholder="https://hooks.slack.com/services/..."
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Create a webhook in your Slack workspace settings
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Alert Conditions */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Alert Conditions</h3>

        {/* Alert Types */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Alert Types
          </label>
          <div className="grid grid-cols-2 gap-2">
            {alertTypeOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-2 p-2 bg-slate-900/50 rounded border border-slate-700/50 cursor-pointer hover:bg-slate-900/70">
                <input
                  type="checkbox"
                  checked={settings.alert_types.includes(option.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSettings({
                        ...settings,
                        alert_types: [...settings.alert_types, option.value],
                      });
                    } else {
                      setSettings({
                        ...settings,
                        alert_types: settings.alert_types.filter((t) => t !== option.value),
                      });
                    }
                  }}
                  className="w-4 h-4 text-purple-600 bg-slate-700 border-slate-600 rounded focus:ring-purple-500"
                />
                <span className="text-sm text-slate-300">{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Severity Threshold */}
        <div>
          <label htmlFor="severity_threshold" className="block text-sm font-medium text-slate-300 mb-1">
            Minimum Severity
          </label>
          <select
            id="severity_threshold"
            value={settings.severity_threshold}
            onChange={(e) => setSettings({ ...settings, severity_threshold: e.target.value as any })}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <p className="text-xs text-slate-500 mt-1">
            Only alerts with this severity or higher will be sent
          </p>
        </div>

        {/* Minimum Interval */}
        <div>
          <label htmlFor="min_interval_minutes" className="block text-sm font-medium text-slate-300 mb-1">
            Minimum Interval (minutes)
          </label>
          <input
            type="number"
            id="min_interval_minutes"
            value={settings.min_interval_minutes}
            onChange={(e) => setSettings({ ...settings, min_interval_minutes: parseInt(e.target.value) || 15 })}
            min={1}
            max={1440}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Minimum time between notifications to prevent spam
          </p>
        </div>
      </div>

      {/* Trigger Conditions */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Trigger Conditions</h3>

        {/* Quality Score Threshold */}
        <div>
          <label htmlFor="quality_score_threshold" className="block text-sm font-medium text-slate-300 mb-1">
            Quality Score Threshold
          </label>
          <input
            type="number"
            id="quality_score_threshold"
            value={settings.quality_score_threshold || ''}
            onChange={(e) => setSettings({
              ...settings,
              quality_score_threshold: e.target.value ? parseFloat(e.target.value) : null,
            })}
            min={0}
            max={100}
            step={0.1}
            placeholder="Leave empty to disable"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Alert when quality score drops below this value
          </p>
        </div>

        {/* Error Rate Threshold */}
        <div>
          <label htmlFor="error_rate_threshold" className="block text-sm font-medium text-slate-300 mb-1">
            Error Rate Threshold (%)
          </label>
          <input
            type="number"
            id="error_rate_threshold"
            value={settings.error_rate_threshold || ''}
            onChange={(e) => setSettings({
              ...settings,
              error_rate_threshold: e.target.value ? parseFloat(e.target.value) : null,
            })}
            min={0}
            max={100}
            step={0.1}
            placeholder="Leave empty to disable"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Alert when error rate exceeds this percentage
          </p>
        </div>

        {/* Drift Threshold */}
        <div>
          <label htmlFor="drift_threshold" className="block text-sm font-medium text-slate-300 mb-1">
            Drift Score Threshold
          </label>
          <input
            type="number"
            id="drift_threshold"
            value={settings.drift_threshold || ''}
            onChange={(e) => setSettings({
              ...settings,
              drift_threshold: e.target.value ? parseFloat(e.target.value) : null,
            })}
            min={0}
            max={100}
            step={0.1}
            placeholder="Leave empty to disable"
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p className="text-xs text-slate-500 mt-1">
            Alert when drift score exceeds this value
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-4 border-t border-slate-700/50">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="primary"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}
