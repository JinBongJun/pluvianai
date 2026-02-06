'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import OrgLayout from '@/components/layout/OrgLayout';
import ProjectTabs from '@/components/ProjectTabs';
import { projectsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import Button from '@/components/ui/Button';
import { FileText } from 'lucide-react';

export default function ProjectGeneralSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const projectId = Number(Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [usageMode, setUsageMode] = useState<'full' | 'test_only'>('full');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    if (projectId && !isNaN(projectId)) {
      loadProject();
    }
  }, [projectId, router]);

  const loadProject = async () => {
    if (!projectId || isNaN(projectId)) return;
    try {
      const p = await projectsAPI.get(projectId);
      setName(p.name ?? '');
      setDescription(p.description ?? '');
      setUsageMode((p.usage_mode as 'full' | 'test_only') ?? 'full');
    } catch (e) {
      toast.showToast('Failed to load project', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || isNaN(projectId)) return;
    setSaving(true);
    try {
      await projectsAPI.update(projectId, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.showToast('Project updated', 'success');
    } catch (err: any) {
      toast.showToast(err?.response?.data?.detail ?? 'Failed to update project', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradeToFullMode = async () => {
    if (!projectId || isNaN(projectId)) return;
    setUpgrading(true);
    try {
      await projectsAPI.update(projectId, { usage_mode: 'full' });
      setUsageMode('full');
      toast.showToast('Upgraded to Full Mode. Live View is now available.', 'success');
    } catch (err: any) {
      toast.showToast(err?.response?.data?.detail ?? 'Failed to upgrade', 'error');
    } finally {
      setUpgrading(false);
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
          <ProjectTabs projectId={projectId} orgId={orgId} basePath={basePath} canManage />

          <div className="mt-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                <FileText className="h-6 w-6 text-ag-accent" />
                General
              </h1>
              <p className="text-slate-400">Project name and description</p>
            </div>

            {loading ? (
              <p className="text-slate-400">Loading...</p>
            ) : (
              <form onSubmit={handleSave} className="space-y-4 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Project name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-ag-accent focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Description (optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-ag-accent focus:outline-none resize-none"
                  />
                </div>

                <div className="border-t border-white/10 pt-6 mt-6">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Usage Mode</label>
                  <p className="text-slate-400 text-sm mb-2">
                    {usageMode === 'full'
                      ? 'Full Mode — Live View and Test Lab are available. You can monitor real traffic and run tests.'
                      : 'Test Only — Only Test Lab is available. No SDK required. Upgrade to Full Mode to enable Live View.'}
                  </p>
                  {usageMode === 'test_only' && (
                    <Button type="button" variant="primary" onClick={handleUpgradeToFullMode} disabled={upgrading}>
                      {upgrading ? 'Upgrading...' : 'Upgrade to Full Mode'}
                    </Button>
                  )}
                </div>

                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}
