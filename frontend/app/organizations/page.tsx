'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import TopHeader from '@/components/layout/TopHeader';
import GlobalSearch from '@/components/search/GlobalSearch';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import { organizationsAPI, OrganizationSummary } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebounce';

const planBadge: Record<string, string> = {
  free: 'bg-slate-800/90 text-cyan-200 border border-cyan-500/40 shadow-[0_0_12px_rgba(34,211,238,0.2)]',
  pro: 'bg-ag-primary/90 text-ag-accent-light border border-cyan-400/50 shadow-[0_0_14px_rgba(34,211,238,0.25)]',
  enterprise: 'bg-emerald-600/90 text-white border border-emerald-400/50 shadow-[0_0_14px_rgba(52,211,153,0.3)]',
};

export default function OrganizationsPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [showSearch, setShowSearch] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userPlan, setUserPlan] = useState('free');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { authAPI, subscriptionAPI } = await import('@/lib/api');
        const [user, subscription] = await Promise.all([
          authAPI.getCurrentUser(),
          subscriptionAPI.getCurrent().catch(() => null)
        ]);
        setUserEmail(user.email || '');
        setUserName(user.full_name || '');
        if (subscription) {
          setUserPlan(subscription.plan_type || 'free');
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Failed to load user info:', error);
        }
      }
    };
    loadUser();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

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
    <div className="min-h-screen bg-ag-bg text-ag-text bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      <TopHeader
        breadcrumb={[{ label: 'Organizations' }]}
        showSearch
        onSearchClick={() => setShowSearch(true)}
        userEmail={userEmail}
        userName={userName}
        userPlan={userPlan}
        onLogout={handleLogout}
        rightContent={
          <div className="flex items-center gap-2">
            <NotificationCenter />
          </div>
        }
      />
      <GlobalSearch isOpen={showSearch} onClose={() => setShowSearch(false)} />

      <main className="px-8 py-10 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-white tracking-wide" style={{ textShadow: '0 0 24px rgba(34,211,238,0.4)' }}>
              Your Organizations
            </h1>
            <p className="text-slate-400">Manage organizations, billing, and projects in one place.</p>
          </div>
          <button
            onClick={() => router.push('/organizations/new')}
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/50 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.2)] hover:shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:border-cyan-400/70 transition-all duration-300"
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
            className="w-full sm:max-w-md rounded-lg border border-cyan-500/30 bg-slate-900/60 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 focus:shadow-[0_0_12px_rgba(34,211,238,0.15)] transition-all duration-200"
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
                className="group w-full text-left rounded-xl border border-cyan-500/30 bg-slate-900/80 px-5 py-4 transition-all duration-300 hover:border-cyan-400/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)] hover:shadow-cyan-500/10"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-semibold bg-slate-800 border border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)] group-hover:shadow-[0_0_16px_rgba(34,211,238,0.35)] transition-shadow duration-300">
                      {org.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-lg font-semibold text-white tracking-wide group-hover:text-cyan-100 transition-colors duration-300" style={{ textShadow: '0 0 20px rgba(34,211,238,0.3)' }}>
                        {org.name}
                      </div>
                      <div className="text-slate-400 text-sm">{org.projects ?? 0} projects</div>
                    </div>
                  </div>
                  {renderPlanBadge(org)}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
