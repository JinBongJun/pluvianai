'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import TopHeader from '@/components/layout/TopHeader';
import { organizationsAPI } from '@/lib/api';

/**
 * Create a new organization — Name * + Description only (§5.1.5 스타일).
 */
export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Organization name is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const org = await organizationsAPI.create({
        name: name.trim(),
        description: description.trim() || null,
        plan_type: 'free',
      });
      router.push(`/organizations/${org.id}/projects`);
    } catch (err: any) {
      const message =
        err?.response?.data?.detail ||
        err?.message ||
        'Failed to create organization';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ag-bg text-ag-text">
      <TopHeader breadcrumb={[{ label: 'Organizations', href: '/organizations' }, { label: 'New' }]} />

      <main className="px-8 py-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Create a new organization</h1>
        <p className="text-slate-400 mb-8">
          Organizations group your projects. Each can have its own team and billing.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="org-name" className="block text-sm font-medium text-slate-300 mb-2">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="org-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              className="w-full rounded-lg border border-white/10 bg-ag-surface px-4 py-3 text-sm text-white placeholder:text-ag-muted focus:border-ag-accent focus:outline-none"
              required
              maxLength={255}
            />
            <p className="mt-1 text-xs text-slate-400">
              What&apos;s the name of your company or team? You can change this later.
            </p>
          </div>

          <div>
            <label htmlFor="org-description" className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              id="org-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of your organization"
              rows={4}
              className="w-full rounded-lg border border-white/10 bg-ag-surface px-4 py-3 text-sm text-white placeholder:text-ag-muted focus:border-ag-accent focus:outline-none resize-none"
              maxLength={2000}
            />
            <p className="mt-1 text-xs text-slate-400">
              You can change this later.
            </p>
          </div>

          <div className="border-t border-white/10 pt-6" />

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.push('/organizations')}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-ag-muted hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="rounded-lg bg-ag-accent px-4 py-2 text-sm font-semibold text-ag-bg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create organization'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
