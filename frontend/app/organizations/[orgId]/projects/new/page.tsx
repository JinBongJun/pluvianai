'use client';

import { useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { projectsAPI, organizationsAPI } from '@/lib/api';
import { useToast } from '@/components/ToastContainer';
import posthog from 'posthog-js';

export default function NewProjectPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as string;
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
      });

      // Track project creation event
      posthog.capture('project_created', {
        project_id: project.id,
        organization_id: Number(orgId),
        has_description: !!description.trim(),
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
            Projects help you organize and monitor your LLM applications.
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
              className="w-full rounded-lg border border-white/10 bg-[#0B0C15] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
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
              className="w-full rounded-lg border border-white/10 bg-[#0B0C15] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none resize-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Add a description to help your team understand this project.
            </p>
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
