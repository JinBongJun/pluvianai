'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { settingsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Key, Plus, Trash2, Copy, Check, Edit2 } from 'lucide-react';

interface APIKey {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
}

export default function APIKeysPage() {
  const router = useRouter();
  const toast = useToast();
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
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

    loadAPIKeys();
  }, [router]);

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
            <p className="text-gray-600 mt-1">Manage your API keys for programmatic access</p>
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
                  You won't be able to see this key again. Make sure to copy it and store it securely.
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
                <Button onClick={() => setNewKey(null)}>
                  I've Saved This Key
                </Button>
              </div>
            </div>
          </Modal>
        )}

        {/* API Keys List */}
        {apiKeys.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Key className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No API keys</h3>
            <p className="text-sm text-gray-600 mb-4">
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
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Key Prefix
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Used
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {apiKeys.map((key) => (
                  <tr key={key.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{key.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm text-gray-600 font-mono bg-gray-100 px-2 py-1 rounded">
                        {key.key_prefix}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(key.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
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
    </DashboardLayout>
  );
}

