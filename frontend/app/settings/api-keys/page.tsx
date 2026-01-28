'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { settingsAPI, projectsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Key, Plus, Trash2, Copy, Check, Edit2, ExternalLink, Activity } from 'lucide-react';
import posthog from 'posthog-js';

interface APIKey {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  usage_count?: number;
  projects_used?: number[];
}

export default function APIKeysPage() {
  const router = useRouter();
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ key: string; name: string } | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadProjects();
    loadAPIKeys();
  }, [router]);

  const loadProjects = async () => {
    try {
      const data = await projectsAPI.list();
      setProjects(data);
    } catch (error: any) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadAPIKeys = async () => {
    try {
      const data = await settingsAPI.getAPIKeys();
      setApiKeys(data);
    } catch (error: any) {
      console.error('Failed to load API keys:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to load API keys', 'error');
      if (error.response?.status === 401) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.showToast('Please enter a name for the API key', 'warning');
      return;
    }

    setCreating(true);
    try {
      const data = await settingsAPI.createAPIKey(newKeyName);
      posthog.capture('api_key_created');
      setNewKey({ key: data.key, name: data.name });
      setNewKeyName('');
      setShowCreateModal(false);
      await loadAPIKeys();
    } catch (error: any) {
      console.error('Failed to create API key:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to create API key', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async (keyId: number) => {
    if (!confirm('Are you sure you want to delete this API key? This action cannot be undone.')) {
      return;
    }

    try {
      await settingsAPI.deleteAPIKey(keyId);
      toast.showToast('API key deleted successfully', 'success');
      await loadAPIKeys();
    } catch (error: any) {
      console.error('Failed to delete API key:', error);
      toast.showToast(error.response?.data?.detail || 'Failed to delete API key', 'error');
    }
  };

  const handleCopyKey = (key: string, keyId: number) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyId(keyId);
    toast.showToast('API key copied to clipboard', 'success');
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const getDaysSinceLastUse = (lastUsedAt: string | null): number | null => {
    if (!lastUsedAt) return null;
    const lastUsed = new Date(lastUsedAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastUsed.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getUsageStatus = (lastUsedAt: string | null): 'active' | 'recent' | 'inactive' => {
    if (!lastUsedAt) return 'inactive';
    const days = getDaysSinceLastUse(lastUsedAt);
    if (days === null) return 'inactive';
    if (days <= 7) return 'active';
    if (days <= 30) return 'recent';
    return 'inactive';
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 border-t-transparent"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="bg-ag-bg min-h-screen">
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">API Keys</h1>
              <p className="text-slate-400 mt-1">Manage your API keys for programmatic access</p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create API Key
            </Button>
          </div>

        {/* New Key Display Modal */}
        {newKey && (
          <Modal
            isOpen={!!newKey}
            onClose={() => setNewKey(null)}
            title="API Key Created"
          >
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-sm text-yellow-800 font-medium mb-2">
                  ⚠️ Important: Save this API key now
                </p>
                <p className="text-xs text-yellow-700">
                  You won&apos;t be able to see this key again. Make sure to copy it and store it securely.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key Name
                </label>
                <Input
                  type="text"
                  value={newKey.name}
                  disabled
                  className="bg-gray-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key
                </label>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={newKey.key}
                    readOnly
                    className="bg-gray-50 font-mono text-sm"
                  />
                  <Button
                    onClick={() => handleCopyKey(newKey.key, -1)}
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    {copiedKeyId === -1 ? (
                      <>
                        <Check className="h-4 w-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setNewKey(null)}>I&apos;ve Saved This Key</Button>
              </div>
            </div>
          </Modal>
        )}

          {/* API Keys List */}
          {apiKeys.length === 0 ? (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm p-12 text-center shadow-2xl">
              <Key className="h-12 w-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No API keys</h3>
              <p className="text-sm text-slate-400 mb-4">
                Create an API key to enable programmatic access to your account
              </p>
              <Button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 mx-auto"
              >
                <Plus className="h-4 w-4" />
                Create Your First API Key
              </Button>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/5 to-white/0 backdrop-blur-sm shadow-2xl overflow-hidden">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-white/5">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Key Prefix
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Last Used
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Projects
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-transparent divide-y divide-white/10">
                  {apiKeys.map((key) => {
                    const usageStatus = getUsageStatus(key.last_used_at);
                    const daysSince = getDaysSinceLastUse(key.last_used_at);
                    return (
                      <tr key={key.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-white">{key.name}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <code className="text-sm text-slate-300 font-mono bg-white/5 px-2 py-1 rounded border border-white/10">
                            {key.key_prefix}
                          </code>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            usageStatus === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            usageStatus === 'recent' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                          }`}>
                            {usageStatus === 'active' ? 'Active' : usageStatus === 'recent' ? 'Recent' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                          {new Date(key.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-slate-300">
                            {key.last_used_at ? (
                              <>
                                <div>{new Date(key.last_used_at).toLocaleDateString()}</div>
                                {daysSince !== null && (
                                  <div className="text-xs text-slate-500">
                                    {daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : `${daysSince} days ago`}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-slate-500">Never</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {projects.length > 0 ? (
                            <Link
                              href="/dashboard"
                              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                            >
                              <Activity className="h-4 w-4" />
                              View Projects
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-sm text-slate-500">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleDeleteKey(key.id)}
                            className="text-red-400 hover:text-red-300 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        {/* Create API Key Modal */}
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setNewKeyName('');
          }}
          title="Create API Key"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Give your API key a descriptive name to help you identify it later.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Key Name
              </label>
              <Input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production API Key"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateKey();
                  }
                }}
              />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewKeyName('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim() || creating}
              >
                {creating ? 'Creating...' : 'Create Key'}
              </Button>
            </div>
          </div>
        </Modal>
        </div>
      </div>
    </DashboardLayout>
  );
}
