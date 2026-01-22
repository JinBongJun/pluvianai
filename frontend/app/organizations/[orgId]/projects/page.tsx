'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import { OrganizationDetail, OrganizationProject, organizationsAPI } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebounce';

export default function OrgProjectsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = params?.orgId;
  const [projectQuery, setProjectQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const debouncedProjectQuery = useDebouncedValue(projectQuery, 300);

  const {
    data: org,
    error: orgError,
    isValidating: orgLoading,
    mutate: refetchOrg,
  } = useSWR<OrganizationDetail>(orgId ? ['organization', orgId] : null, ([, id]) =>
    organizationsAPI.get(id as string, { includeStats: true }),
  );

  const {
    data: projects,
    error: projectsError,
    isValidating: projectsLoading,
    mutate: refetchProjects,
  } = useSWR<OrganizationProject[]>(orgId ? ['organization-projects', orgId, debouncedProjectQuery] : null, ([, id, search]) =>
    organizationsAPI.listProjects(id as string, { includeStats: true, search: search as string }),
  );

  const usagePerc = useMemo(() => {
    if (!org) return { callsPct: 0, costPct: 0 };
    const callsPct = org.usage.callsLimit
      ? Math.min(100, Math.round((org.usage.calls / org.usage.callsLimit) * 100))
      : 0;
    const costPct = org.usage.costLimit
      ? Math.min(100, Math.round((org.usage.cost / org.usage.costLimit) * 100))
      : 0;
    return { callsPct, costPct };
  }, [org]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const q = debouncedProjectQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (project) =>
        project.name.toLowerCase().includes(q) ||
        project.description?.toLowerCase().includes(q),
    );
  }, [debouncedProjectQuery, projects]);

  const loading = (!org && orgLoading) || (!projects && projectsLoading);
  const firstProjectId = filteredProjects[0]?.id ?? projects?.[0]?.id;

  if (!orgId) {
    return null;
  }

  return (
    <OrgLayout
      orgId={orgId}
      breadcrumb={[
        { label: 'Organizations', href: '/organizations' },
        { label: org?.name || 'Organization' },
      ]}
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">{org?.name || 'Organization'}</h1>
            <p className="text-slate-400">
              Plan:{' '}
              {org?.plan === 'free'
                ? 'Free'
                : org?.plan === 'pro'
                ? 'Pro'
                : org?.plan === 'enterprise'
                ? 'Enterprise'
                : org?.plan || 'Free'}
            </p>
          </div>
          <button
            onClick={() => router.push(`/organizations/${orgId}/projects/new`)}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>New project</span>
          </button>
        </div>

        {(orgError || projectsError) && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-900/10 p-4 text-sm text-red-200">
            {orgError instanceof Error ? orgError.message : 'Failed to load organization'}
            {projectsError && <span className="ml-2">{projectsError instanceof Error ? projectsError.message : ''}</span>}
            <button
              onClick={() => {
                refetchOrg();
                refetchProjects();
              }}
              className="ml-3 underline text-red-100 hover:text-white text-xs"
            >
              Retry
            </button>
          </div>
        )}

        {loading && (
          <div className="space-y-3 mb-6">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="h-24 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        )}

        {/* Usage & Alerts sections */}
        <div className="grid gap-4 lg:grid-cols-3 mb-6">
          <div className="rounded-xl border border-white/10 bg-[#0B0C15] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">API Calls (7d)</span>
              <span className="text-xs text-slate-400">
                {org?.usage?.calls?.toLocaleString?.() ?? 0} / {org?.usage?.callsLimit?.toLocaleString?.() ?? 0}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-purple-500" style={{ width: `${usagePerc.callsPct}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0B0C15] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Cost (7d)</span>
              <span className="text-xs text-slate-400">
                ${org?.usage?.cost?.toFixed(2) ?? '0.00'} / ${org?.usage?.costLimit?.toFixed(2) ?? '0.00'}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${usagePerc.costPct}%` }} />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0B0C15] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Quality</span>
              <span className="text-xs text-slate-200">{org?.usage?.quality?.toFixed(1) ?? '0.0'}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: `${org?.usage?.quality ?? 0}%` }} />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 mb-8">
          <div className="rounded-xl border border-white/10 bg-[#0B0C15] p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">Alerts</span>
                <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-200">
                  {org?.alerts?.length ?? 0} open
                </span>
              </div>
              <button
                onClick={() => {
                  if (firstProjectId) {
                    router.push(`/organizations/${orgId}/projects/${firstProjectId}/alerts`);
                  }
                }}
                className="text-xs text-purple-300 hover:text-purple-200"
              >
                View all →
              </button>
            </div>
            <div className="space-y-2">
              {(org?.alerts || []).map((a, idx) => (
                <div
                  key={`${a.project}-${idx}`}
                  className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-200"
                >
                  <span className="text-purple-200 font-semibold">{a.project || 'Unknown project'}</span> —{' '}
                  {a.summary || 'Alert detected'}
                </div>
              ))}
              {!org?.alerts?.length && (
                <div className="rounded-lg border border-dashed border-white/10 bg-white/5 px-3 py-4 text-sm text-slate-400 text-center">
                  No active alerts.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0B0C15] p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-400">View</span>
              <div className="inline-flex items-center rounded-lg border border-white/10 bg-white/5">
                <button
                  onClick={() => setView('grid')}
                  className={`px-3 py-1 text-xs ${view === 'grid' ? 'bg-purple-600 text-white rounded-l-lg' : 'text-slate-300'}`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`px-3 py-1 text-xs ${view === 'list' ? 'bg-purple-600 text-white rounded-r-lg' : 'text-slate-300'}`}
                >
                  List
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-400">Switch between grid and list views for projects.</p>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <input
            id="project-search"
            placeholder="Search for a project"
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
            className="w-full sm:max-w-md rounded-lg border border-white/10 bg-[#0B0C15] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
          />
        </div>

        {!filteredProjects.length && !loading ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-[#0B0C15] p-10 text-center text-slate-400">
            <p className="mb-4">
              {projectQuery.trim()
                ? `No projects match "${projectQuery}".`
                : 'No projects yet. Create your first project to get started.'}
            </p>
            <button
              onClick={() => router.push(`/organizations/${orgId}/projects/new`)}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              <span>New project</span>
            </button>
          </div>
        ) : view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                className="w-full text-left rounded-xl border border-white/10 bg-[#0B0C15] px-5 py-4 hover:border-purple-500/50 hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-lg font-semibold">{p.name}</div>
                    {p.description && <div className="text-slate-400 text-sm">{p.description}</div>}
                  </div>
                  <span className="text-xs text-slate-500">#{p.id}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-300">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    📊 {p.calls24h?.toLocaleString() ?? 0} (24h)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    💰 ${p.cost7d?.toFixed(2) ?? '0.00'} (7d)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    ⭐ {p.quality?.toFixed(1) ?? '–'}%
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    ⚠️ {p.alerts ?? 0} alerts
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-1">
                    🔄 {p.drift ? 'Drift' : 'No drift'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0B0C15]">
            <table className="min-w-full text-sm text-slate-200">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Calls (24h)</th>
                  <th className="px-4 py-3 text-left">Cost (7d)</th>
                  <th className="px-4 py-3 text-left">Quality</th>
                  <th className="px-4 py-3 text-left">Alerts</th>
                  <th className="px-4 py-3 text-left">Drift</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                  >
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3">{p.calls24h?.toLocaleString() ?? 0}</td>
                    <td className="px-4 py-3">${p.cost7d?.toFixed(2) ?? '0.00'}</td>
                    <td className="px-4 py-3">{p.quality?.toFixed(1) ?? '–'}%</td>
                    <td className="px-4 py-3">{p.alerts ?? 0}</td>
                    <td className="px-4 py-3">{p.drift ? 'Drift' : 'No drift'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OrgLayout>
  );
}
