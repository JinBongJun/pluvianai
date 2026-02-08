'use client';

import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import TopHeader from '@/components/layout/TopHeader';
import GlobalSearch from '@/components/search/GlobalSearch';
import NotificationCenter from '@/components/notifications/NotificationCenter';
import { organizationsAPI, OrganizationSummary } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebounce';
import { Plus, Search, Building2, Shield, Activity, ArrowUpRight } from 'lucide-react';

const planBadge: Record<string, string> = {
  free: 'bg-slate-900 border border-slate-800 text-slate-500',
  pro: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400',
  enterprise: 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-400',
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
      key === 'free' ? 'Standard' : key === 'pro' ? 'Pro Lab' : key === 'enterprise' ? 'Enterprise' : org.plan;
    return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${className}`}>{label}</span>;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0c] text-white selection:bg-emerald-500/30">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent pointer-events-none" />

      <TopHeader
        breadcrumb={[{ label: 'Atomic Lab Access' }]}
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

      <main className="px-8 py-12 max-w-5xl mx-auto relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase tracking-[0.2em] mb-2">
              <Activity className="w-3 h-3" />
              Lab Authorization Active
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white">
              Select Laboratory
            </h1>
            <p className="text-slate-500 text-sm max-w-md font-medium">
              Authorized access to validated agent organizations and clinical testing environments.
            </p>
          </div>

          <button
            onClick={() => router.push('/organizations/new')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-bold shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all group shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Initialize New Lab</span>
          </button>
        </div>

        <div className="mb-8 relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-emerald-500 transition-colors">
            <Search className="h-4 w-4" />
          </div>
          <input
            id="org-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter authorized organizations..."
            className="w-full pl-11 pr-4 py-3 bg-slate-900/50 border border-slate-800 rounded-2xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all text-sm font-medium"
          />
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400 font-medium flex items-center justify-between">
            <span>{error instanceof Error ? error.message : 'Failed to load labs. Authorization error.'}</span>
            <button
              onClick={() => mutate()}
              className="px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors text-xs"
            >
              Retry Sync
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-40 animate-pulse rounded-2xl bg-white/5 border border-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-800 bg-slate-900/20 p-16 text-center">
            <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-slate-900 border border-slate-800 mb-6 text-slate-600">
              <Building2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No Labs Authorized</h3>
            <p className="text-slate-500 text-sm max-w-xs mx-auto mb-8 font-medium">
              {query.trim()
                ? `No organizations found matching "${query}".`
                : "You haven't initialized or joined any organizations yet."}
            </p>
            {!query.trim() && (
              <button
                onClick={() => router.push('/organizations/new')}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-white text-sm font-bold transition-all"
              >
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>Create Organization</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((org) => (
              <button
                key={org.id}
                onClick={() => router.push(`/organizations/${org.id}/projects`)}
                className="group relative flex flex-col p-6 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-emerald-500/30 hover:bg-emerald-500/[0.02] transition-all duration-300 text-left"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="h-12 w-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-500 font-bold text-lg group-hover:border-emerald-500/50 transition-colors shadow-inner">
                    {org.name.slice(0, 2).toUpperCase()}
                  </div>
                  {renderPlanBadge(org)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {org.name}
                    </h3>
                    <ArrowUpRight className="w-4 h-4 text-slate-700 group-hover:text-emerald-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>
                  <div className="flex items-center gap-3 text-slate-500 text-xs font-bold uppercase tracking-wider">
                    <span className="flex items-center gap-1">
                      <Activity className="w-3 h-3 text-cyan-500" />
                      {org.projects ?? 0} Projects
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-800" />
                    <span className="flex items-center gap-1 text-slate-600">
                      <Shield className="w-3 h-3" />
                      Validated
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="h-1 w-12 bg-emerald-500/50 rounded-full blur-sm" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-8 text-[11px] font-bold text-slate-700 uppercase tracking-widest hidden lg:block">
        Access Token: <span className="text-slate-800"> verified_session_active</span>
      </div>
    </div>
  );
}
