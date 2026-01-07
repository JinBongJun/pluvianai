'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { settingsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Bell, Mail, MessageSquare, Save } from 'lucide-react';

export default function NotificationsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    email_drift: true,
    email_cost_anomaly: true,
    email_quality_drop: true,
    in_app_drift: true,
    in_app_cost_anomaly: true,
    in_app_quality_drop: true,
    slack_enabled: false,
    slack_webhook_url: '',
    discord_enabled: false,
    discord_webhook_url: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadSettings();
  }, [router]);

  const loadSettings = async () => {
    try {
      const data = await settingsAPI.getNotificationSettings();
      setSettings({
        email_drift: data.email_drift ?? true,
        email_cost_anomaly: data.email_cost_anomaly ?? true,
        email_quality_drop: data.email_quality_drop ?? true,
        in_app_drift: data.in_app_drift ?? true,
        in_app_cost_anomaly: data.in_app_cost_anomaly ?? true,
        in_app_quality_drop: data.in_app_quality_drop ?? true,
        slack_enabled: data.slack_enabled ?? false,
        slack_webhook_url: data.slack_webhook_url || '',
        discord_enabled: data.discord_enabled ?? false,
        discord_webhook_url: data.discord_webhook_url || '',
      });
    } catch (error: any) {
      console.error('Failed to load notification settings:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load notification settings', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsAPI.updateNotificationSettings(settings);
      toast.showToast('Notification settings updated successfully', 'success');
    } catch (error: any) {
      console.error('Failed to update notification settings:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to update notification settings', 'error');
    } finally {
      setSaving(false);
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
          <h1 className="text-3xl font-bold text-gray-900">Notification Settings</h1>
          <p className="text-gray-600 mt-1">Configure how and when you receive notifications</p>
        </div>

        {/* Email Notifications */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Email Notifications</h2>
              <p className="text-sm text-gray-600">Receive notifications via email</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Drift Detection</div>
                <div className="text-sm text-gray-600">Get notified when model drift is detected</div>
              </div>
              <input
                type="checkbox"
                checked={settings.email_drift}
                onChange={(e) => setSettings({ ...settings, email_drift: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Cost Anomaly</div>
                <div className="text-sm text-gray-600">Get notified when unusual cost patterns are detected</div>
              </div>
              <input
                type="checkbox"
                checked={settings.email_cost_anomaly}
                onChange={(e) => setSettings({ ...settings, email_cost_anomaly: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Quality Drop</div>
                <div className="text-sm text-gray-600">Get notified when quality scores drop significantly</div>
              </div>
              <input
                type="checkbox"
                checked={settings.email_quality_drop}
                onChange={(e) => setSettings({ ...settings, email_quality_drop: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>
          </div>
        </div>

        {/* In-App Notifications */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-orange-50 rounded-lg">
              <Bell className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">In-App Notifications</h2>
              <p className="text-sm text-gray-600">Receive notifications within the application</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Drift Detection</div>
                <div className="text-sm text-gray-600">Show in-app notifications for drift detection</div>
              </div>
              <input
                type="checkbox"
                checked={settings.in_app_drift}
                onChange={(e) => setSettings({ ...settings, in_app_drift: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Cost Anomaly</div>
                <div className="text-sm text-gray-600">Show in-app notifications for cost anomalies</div>
              </div>
              <input
                type="checkbox"
                checked={settings.in_app_cost_anomaly}
                onChange={(e) => setSettings({ ...settings, in_app_cost_anomaly: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>

            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Quality Drop</div>
                <div className="text-sm text-gray-600">Show in-app notifications for quality drops</div>
              </div>
              <input
                type="checkbox"
                checked={settings.in_app_quality_drop}
                onChange={(e) => setSettings({ ...settings, in_app_quality_drop: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>
          </div>
        </div>

        {/* Slack Integration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-purple-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Slack Integration</h2>
              <p className="text-sm text-gray-600">Send notifications to a Slack channel</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Enable Slack Notifications</div>
                <div className="text-sm text-gray-600">Send notifications to your Slack workspace</div>
              </div>
              <input
                type="checkbox"
                checked={settings.slack_enabled}
                onChange={(e) => setSettings({ ...settings, slack_enabled: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>

            {settings.slack_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slack Webhook URL
                </label>
                <Input
                  type="url"
                  value={settings.slack_webhook_url}
                  onChange={(e) => setSettings({ ...settings, slack_webhook_url: e.target.value })}
                  placeholder="https://hooks.slack.com/services/..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Create a webhook in your Slack workspace settings
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Discord Integration */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <MessageSquare className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Discord Integration</h2>
              <p className="text-sm text-gray-600">Send notifications to a Discord channel</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
              <div>
                <div className="font-medium text-gray-900">Enable Discord Notifications</div>
                <div className="text-sm text-gray-600">Send notifications to your Discord server</div>
              </div>
              <input
                type="checkbox"
                checked={settings.discord_enabled}
                onChange={(e) => setSettings({ ...settings, discord_enabled: e.target.checked })}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
            </label>

            {settings.discord_enabled && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discord Webhook URL
                </label>
                <Input
                  type="url"
                  value={settings.discord_webhook_url}
                  onChange={(e) => setSettings({ ...settings, discord_webhook_url: e.target.value })}
                  placeholder="https://discord.com/api/webhooks/..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Create a webhook in your Discord channel settings
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

