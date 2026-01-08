'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { webhooksAPI, projectsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Plus, Trash2, Play, Copy, Check, ExternalLink } from 'lucide-react';
import { clsx } from 'clsx';

interface Webhook {
  id: number;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered_at: string | null;
  failure_count: number;
  project_id: number | null;
}

const availableEvents = [
  'drift',
  'cost_spike',
  'error',
  'timeout',
  'quality_drop',
  'model_update',
  'alert_created',
  'alert_resolved',
];

export default function WebhooksPage() {
  const router = useRouter();
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    url: '',
    project_id: null as number | null,
    events: [] as string[],
    secret: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      const [webhooksData, projectsData] = await Promise.all([
        webhooksAPI.list(),
        projectsAPI.list(),
      ]);
      setWebhooks(webhooksData);
      setProjects(projectsData);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load webhooks', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newWebhook.name || !newWebhook.url || newWebhook.events.length === 0) {
      toast.showToast('Please fill in all required fields', 'warning');
      return;
    }

    try {
      await webhooksAPI.create(newWebhook);
      toast.showToast('Webhook created successfully', 'success');
      setShowCreateModal(false);
      setNewWebhook({ name: '', url: '', project_id: null, events: [], secret: '' });
      loadData();
    } catch (error: any) {
      console.error('Failed to create webhook:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to create webhook', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    try {
      await webhooksAPI.delete(id);
      toast.showToast('Webhook deleted successfully', 'success');
      loadData();
    } catch (error: any) {
      console.error('Failed to delete webhook:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to delete webhook', 'error');
    }
  };

  const handleTest = async (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setShowTestModal(true);
    setTesting(true);
    setTestResult(null);

    try {
      const result = await webhooksAPI.test(webhook.id);
      setTestResult(result);
    } catch (error: any) {
      console.error('Failed to test webhook:', error);
      setTestResult({
        success: false,
        error: error.response?.data?.detail || 'Failed to test webhook',
      });
    } finally {
      setTesting(false);
    }
  };

  const toggleEvent = (event: string) => {
    setNewWebhook((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Webhooks</h1>
            <p className="text-gray-600 mt-1">Configure webhooks to receive real-time notifications</p>
          </div>
          <Button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Webhook
          </Button>
        </div>

        {/* Webhooks List */}
        {webhooks.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <ExternalLink className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No webhooks</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create a webhook to receive real-time notifications about your projects
            </p>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 mx-auto"
            >
              <Plus className="h-4 w-4" />
              Create Your First Webhook
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{webhook.name}</h3>
                      {webhook.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default">Inactive</Badge>
                      )}
                      {webhook.failure_count > 0 && (
                        <Badge variant="warning">{webhook.failure_count} failures</Badge>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      <div className="font-mono break-all">{webhook.url}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {webhook.events.map((event) => (
                        <Badge key={event} variant="default" size="sm">
                          {event}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500">
                      {webhook.last_triggered_at
                        ? `Last triggered: ${new Date(webhook.last_triggered_at).toLocaleString()}`
                        : 'Never triggered'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTest(webhook)}
                      className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                      title="Test webhook"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="p-2 text-red-600 hover:text-red-900 hover:bg-red-50 rounded"
                      title="Delete webhook"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Webhook Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setNewWebhook({ name: '', url: '', project_id: null, events: [], secret: '' });
          }}
          title="Create Webhook"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <Input
                type="text"
                value={newWebhook.name}
                onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                placeholder="My Webhook"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL
              </label>
              <Input
                type="url"
                value={newWebhook.url}
                onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                placeholder="https://example.com/webhook"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project (Optional)
              </label>
              <select
                value={newWebhook.project_id || ''}
                onChange={(e) =>
                  setNewWebhook({
                    ...newWebhook,
                    project_id: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="w-full border-gray-300 rounded-md focus:ring-black focus:border-black"
              >
                <option value="">All Projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Events
              </label>
              <div className="grid grid-cols-2 gap-2">
                {availableEvents.map((event) => (
                  <label
                    key={event}
                    className="flex items-center gap-2 p-2 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={newWebhook.events.includes(event)}
                      onChange={() => toggleEvent(event)}
                      className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700 capitalize">
                      {event.replace('_', ' ')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Secret (Optional)
              </label>
              <Input
                type="text"
                value={newWebhook.secret}
                onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value })}
                placeholder="Leave empty to auto-generate"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used for webhook signature verification
              </p>
            </div>

            <div className="flex gap-3 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewWebhook({ name: '', url: '', project_id: null, events: [], secret: '' });
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create Webhook</Button>
            </div>
          </div>
        </Modal>

        {/* Test Webhook Modal */}
        <Modal
          isOpen={showTestModal}
          onClose={() => {
            setShowTestModal(false);
            setTestResult(null);
          }}
          title="Test Webhook"
        >
          <div className="space-y-4">
            {testing ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-4"></div>
                <p className="text-sm text-gray-600">Sending test webhook...</p>
              </div>
            ) : testResult ? (
              <div>
                {testResult.success ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="h-5 w-5 text-green-600" />
                      <div className="font-medium text-green-900">Test Successful</div>
                    </div>
                    <div className="text-sm text-green-700">
                      Status Code: {testResult.status_code}
                    </div>
                    {testResult.response && (
                      <div className="mt-2 text-xs text-green-600 font-mono bg-green-100 p-2 rounded">
                        {testResult.response}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="font-medium text-red-900 mb-2">Test Failed</div>
                    <div className="text-sm text-red-700">
                      {testResult.error || 'Unknown error'}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex justify-end pt-4">
              <Button onClick={() => setShowTestModal(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      </div>
    </DashboardLayout>
  );
}
