'use client';

import { useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { projectsAPI, organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import posthog from 'posthog-js';

type UsageMode = 'full' | 'test_only';

export default function NewProjectPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [usageMode, setUsageMode] = useState<UsageMode>('full');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: org } = useSWR(orgId ? ['organization', orgId] : null, () =>
    organizationsAPI.get(orgId, { includeStats: false }),
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const project = await projectsAPI.create({
        name: name.trim(),
        description: description.trim() || undefined,
        organization_id: Number(orgId),
        usage_mode: usageMode,
      });

      // Track project creation event
      posthog.capture('project_created', {
        project_id: project.id,
        organization_id: Number(orgId),
        has_description: !!description.trim(),
        usage_mode: usageMode,
      });

      toast.showToast('Project created successfully', 'success');
      router.push(`/organizations/${orgId}/projects/${project.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to create project');
      toast.showToast(err.response?.data?.detail || 'Failed to create project', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!orgId) {
    return null;
  }

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization', href: `/organizations/${orgId}/projects` },
        { label: 'New Project' },
      ]}
    >
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Create a new project</h1>
          <p className="text-slate-400">
            Projects help you organize and monitor your LLM apps.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-900/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Project Name *
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              required
              className="w-full rounded-lg border border-white/10 bg-ag-surface px-4 py-3 text-sm text-white placeholder:text-ag-muted focus:border-ag-accent focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Choose a descriptive name for your project.
            </p>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of your project"
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-ag-surface px-4 py-3 text-sm text-white placeholder:text-ag-muted focus:border-ag-accent focus:outline-none resize-none"
            />
          </div>

          <div className="border-t border-white/10 pt-6">
            <p className="block text-sm font-medium text-slate-300 mb-3">Usage Mode</p>
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-ag-surface px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors has-[:checked]:border-ag-accent has-[:checked]:bg-ag-accent/10">
                <input
                  type="radio"
                  name="usage_mode"
                  value="full"
                  checked={usageMode === 'full'}
                  onChange={() => setUsageMode('full')}
                  className="mt-1 h-4 w-4 border-white/20 text-ag-accent focus:ring-ag-accent"
                />
                <div>
                  <span className="font-medium text-white">Full Mode (Live View + Test Lab)</span>
                  <p className="text-xs text-slate-400 mt-0.5">Monitor real traffic and run tests</p>
                </div>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-ag-surface px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors has-[:checked]:border-ag-accent has-[:checked]:bg-ag-accent/10">
                <input
                  type="radio"
                  name="usage_mode"
                  value="test_only"
                  checked={usageMode === 'test_only'}
                  onChange={() => setUsageMode('test_only')}
                  className="mt-1 h-4 w-4 border-white/20 text-ag-accent focus:ring-ag-accent"
                />
                <div>
                  <span className="font-medium text-white">Test Only (Test Lab only, no SDK required)</span>
                  <p className="text-xs text-slate-400 mt-0.5">Skip SDK setup, jump straight to testing</p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => router.push(`/organizations/${orgId}/projects`)}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </OrgLayout>
  );
}
