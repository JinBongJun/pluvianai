'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import OrgLayout from '@/components/layout/OrgLayout';
import ProjectTabs from '@/components/ProjectTabs';
import { projectUserApiKeysAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import { Button } from '@/components/ui/Button';
import { Key, Plus, Trash2 } from 'lucide-react';

interface UserApiKeyItem {
  id: number;
  project_id: number;
  provider: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  custom: 'Custom',
};

export default function ProjectApiKeysPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const [keys, setKeys] = useState<UserApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [formProvider, setFormProvider] = useState<string>('openai');
  const [formApiKey, setFormApiKey] = useState('');
  const [formName, setFormName] = useState('');

  const loadKeys = useCallback(async () => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const list = await projectUserApiKeysAPI.list(projectId);
      setKeys(Array.isArray(list) ? list : []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.showToast('Failed to load API keys', 'error');
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    if (projectId && !isNaN(projectId)) {
      void loadKeys();
    }
  }, [projectId, router, loadKeys]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || isNaN(projectId) || !formApiKey.trim()) return;
    setAdding(true);
    try {
      await projectUserApiKeysAPI.create(projectId, {
        provider: formProvider,
        api_key: formApiKey.trim(),
        name: formName.trim() || undefined,
      });
      toast.showToast('API key added', 'success');
      setFormApiKey('');
      setFormName('');
      loadKeys();
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Failed to add API key';
      toast.showToast(typeof msg === 'string' ? msg : JSON.stringify(msg), 'error');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (keyId: number) => {
    if (!projectId || isNaN(projectId) || !confirm('Remove this API key?')) return;
    try {
      await projectUserApiKeysAPI.delete(projectId, keyId);
      toast.showToast('API key removed', 'success');
      loadKeys();
    } catch (err: any) {
      toast.showToast(err?.response?.data?.detail ?? 'Failed to remove key', 'error');
    }
  };

  if (!projectId || isNaN(projectId)) {
    return null;
  }

  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen bg-ag-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProjectTabs projectId={projectId} orgId={orgId} basePath={basePath} />

          <div className="mt-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <Key className="h-6 w-6 text-ag-accent" />
                API Keys
              </h1>
              <p className="text-slate-400">
                LLM API keys for this project. Used by Policy validation and replay-style checks (OpenAI, Anthropic, Google).
                Custom models (model_id, base_url) can be added here and selected per evaluation flow.
              </p>
            </div>

            {/* Add key form */}
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 mb-6">
              <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add API Key
              </h2>
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Provider</label>
                  <select
                    value={formProvider}
                    onChange={(e) => setFormProvider(e.target.value)}
                    className="w-full max-w-xs rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white focus:border-ag-accent focus:outline-none"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="google">Google</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">API Key</label>
                  <input
                    type="password"
                    value={formApiKey}
                    onChange={(e) => setFormApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full max-w-md rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-ag-accent focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Name (optional)</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Production key"
                    className="w-full max-w-md rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-ag-accent focus:outline-none"
                  />
                </div>
                <Button type="submit" disabled={adding || !formApiKey.trim()}>
                  {adding ? 'Adding...' : 'Add key'}
                </Button>
              </form>
            </div>

            {/* List */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">Registered keys</h2>
              {loading ? (
                <p className="text-slate-400">Loading...</p>
              ) : keys.length === 0 ? (
                <p className="text-slate-400">No API keys yet. Add one above.</p>
              ) : (
                <ul className="space-y-2">
                  {keys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-4 py-3"
                    >
                      <div>
                        <span className="font-medium text-white">
                          {PROVIDER_LABELS[k.provider] ?? k.provider}
                        </span>
                        {k.name && (
                          <span className="text-slate-400 ml-2">({k.name})</span>
                        )}
                        <span className="text-slate-500 text-sm ml-2">
                          added {k.created_at ? new Date(k.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDelete(k.id)}
                        className="p-2 text-slate-400 hover:text-red-400 rounded transition-colors"
                        title="Remove key"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
