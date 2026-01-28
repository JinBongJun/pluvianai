'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import TopHeader from '@/components/layout/TopHeader';
import { organizationsAPI, OrganizationSummary } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebounce';

const planBadge: Record<string, string> = {
  free: 'bg-slate-800 text-slate-100',
  pro: 'bg-ag-primary text-ag-accent-light',
  enterprise: 'bg-emerald-600 text-white',
};

export default function OrganizationsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);

  const {
    data: orgs,
    error,
    isValidating,
    mutate,
  } = useSWR(['organizations', debouncedQuery], ([, search]) =>
    organizationsAPI.list({ includeStats: true, search }),
  );

  const loading = !orgs && isValidating;

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) => org.name.toLowerCase().includes(q));
  }, [debouncedQuery, orgs]);

  const renderPlanBadge = (org: OrganizationSummary) => {
    const key = String(org.plan || 'free').toLowerCase();
    const className = planBadge[key] || 'bg-slate-800 text-slate-100';
    const label =
      key === 'free' ? 'Free' : key === 'pro' ? 'Pro' : key === 'enterprise' ? 'Enterprise' : org.plan;
    return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
  };

  return (
    <div className="min-h-screen bg-ag-bg text-ag-text">
      <TopHeader
        breadcrumb={[{ label: 'Organizations' }]}
        onSearchClick={() => {
          const input = document.getElementById('org-search');
          if (input) input.focus();
        }}
      />

      <main className="px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Your Organizations</h1>
            <p className="text-slate-400">Manage organizations, billing, and projects in one place.</p>
          </div>
          <button
            onClick={() => router.push('/organizations/new')}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>New organization</span>
          </button>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            id="org-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for an organization"
            className="w-full sm:max-w-md rounded-lg border border-white/10 bg-ag-surface px-4 py-3 text-sm text-white placeholder:text-ag-muted focus:border-ag-accent focus:outline-none"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-900/10 p-4 text-sm text-red-200">
            {error instanceof Error ? error.message : 'Failed to load organizations'}
            <button
              onClick={() => mutate()}
              className="ml-3 underline text-red-100 hover:text-white text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={idx} className="h-24 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-ag-surface p-10 text-center text-slate-400">
            {query.trim() ? (
              <p>No organizations match &quot;{query}&quot;.</p>
            ) : (
              <>
                <p className="mb-4">No organizations found. Create your first organization to get started.</p>
                <button
                  onClick={() => router.push('/organizations/new')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>New organization</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {filtered.map((org) => (
              <button
                key={org.id}
                onClick={() => router.push(`/organizations/${org.id}/projects`)}
                className="w-full text-left rounded-xl border border-white/10 bg-ag-surface px-5 py-4 hover:border-ag-accent/50 hover:bg-white/5 transition-colors"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-ag-primary/70 to-ag-primaryHover/70 flex items-center justify-center text-white font-semibold">
                      {org.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{org.name}</div>
                      <div className="text-slate-400 text-sm">{org.projects ?? 0} projects</div>
                    </div>
                  </div>
                  {renderPlanBadge(org)}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    📊 {org.calls7d?.toLocaleString() ?? 0} calls (7d)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    💰 ${org.cost7d?.toFixed(2) ?? '0.00'} (7d)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    ⚠️ {org.alertsOpen ?? 0} alerts
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    🔄 {org.driftDetected ? 'Drift detected' : 'No drift'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
