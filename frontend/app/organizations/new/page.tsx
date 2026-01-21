'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import TopHeader from '@/components/layout/TopHeader';

export default function NewOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState('personal');
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
      const res = await fetch('/api/v1/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          type: type || null,
          plan_type: 'free',
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to create organization');
      }

      const org = await res.json();
      router.push(`/organizations/${org.id}/projects`);
    } catch (err: any) {
      setError(err.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#000314] text-white">
      <TopHeader breadcrumb={[{ label: 'Organizations', href: '/organizations' }, { label: 'New' }]} />

      <main className="px-8 py-10 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Create a new organization</h1>
        <p className="text-slate-400 mb-8">
          Organizations are a way to group your projects. Each organization can be configured with different team
          members and billing settings.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organization name"
              className="w-full rounded-lg border border-white/10 bg-[#0B0C15] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
              required
              maxLength={255}
            />
            <p className="mt-1 text-sm text-slate-400">
              What's the name of your company or team? You can change this later.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0B0C15] px-4 py-3 text-sm text-white focus:border-purple-500 focus:outline-none"
            >
              <option value="personal">Personal</option>
              <option value="startup">Startup</option>
              <option value="company">Company</option>
              <option value="agency">Agency</option>
              <option value="educational">Educational</option>
              <option value="na">N/A</option>
            </select>
            <p className="mt-1 text-sm text-slate-400">What best describes your organization?</p>
          </div>

          <div className="rounded-lg border border-blue-900 bg-blue-900/10 p-4">
            <p className="text-sm text-blue-200">
              ℹ️ Your organization will start on the Free plan. You can upgrade anytime from Settings &gt; Billing.
            </p>
          </div>

          <div className="rounded-lg border border-blue-900 bg-blue-900/10 p-4">
            <p className="text-sm text-blue-200">
              ℹ️ You'll be the owner of this organization. You can invite team members and transfer ownership later
              from Settings &gt; Team.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-900/10 p-4 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => router.push('/organizations')}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Creating...' : 'Create organization'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
