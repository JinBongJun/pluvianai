'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import OrgLayout from '@/components/layout/OrgLayout';
import Button from '@/components/ui/Button';
import { clsx } from 'clsx';
import { OrganizationDetail, OrganizationProject, organizationsAPI } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/useDebounce';

export default function OrgProjectsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId;
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
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-6 text-ag-text">Projects</h1>
          
          {/* Search and Actions Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <input
                  id="project-search"
                  placeholder="Search for a project"
                  value={projectQuery}
                  onChange={(e) => setProjectQuery(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-ag-surface px-4 py-2 pl-10 text-sm text-ag-text placeholder:text-ag-muted focus:border-ag-accent focus:outline-none"
                />
                <svg
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-ag-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <button className="rounded-lg border border-white/10 bg-ag-surface p-2 hover:bg-white/5 transition-colors text-ag-muted hover:text-ag-text">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-lg border border-white/10 bg-ag-surface overflow-hidden">
                <button
                  onClick={() => setView('grid')}
                  className={clsx(
                    'p-2 transition-colors',
                    view === 'grid' ? 'bg-ag-primary text-ag-bg' : 'text-ag-muted hover:bg-white/5 hover:text-ag-text'
                  )}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setView('list')}
                  className={clsx(
                    'p-2 transition-colors border-l border-white/10',
                    view === 'list' ? 'bg-ag-primary text-ag-bg' : 'text-ag-muted hover:bg-white/5 hover:text-ag-text'
                  )}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
              <Button
                onClick={() => router.push(`/organizations/${orgId}/projects/new`)}
                className="flex items-center gap-2"
              >
                <span className="text-lg leading-none">+</span>
                <span>New project</span>
              </Button>
            </div>
          </div>
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

        {/* Alerts section */}
        {org?.alerts && org.alerts.length > 0 && (
          <div className="mb-8">
            <div className="rounded-xl border border-white/10 bg-ag-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Alerts</span>
                  <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-200">
                    {org.alerts.length} open
                  </span>
                </div>
                <button
                  onClick={() => {
                    if (firstProjectId) {
                      router.push(`/organizations/${orgId}/projects/${firstProjectId}/alerts`);
                    }
                  }}
                  className="text-xs text-ag-accentLight hover:text-ag-accent"
                >
                  View all →
                </button>
              </div>
              <div className="space-y-2">
                {org.alerts.map((a, idx) => (
                  <div
                    key={`${a.project}-${idx}`}
                    className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-sm text-slate-200"
                  >
                    <span className="text-ag-accentLight font-semibold">{a.project || 'Unknown project'}</span> —{' '}
                    {a.summary || 'Alert detected'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {!filteredProjects.length && !loading ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-ag-surface p-10 text-center text-slate-400">
            <p>
              {projectQuery.trim()
                ? `No projects match "${projectQuery}".`
                : 'No projects yet. Create your first project to get started.'}
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                className="w-full text-left rounded-xl border border-white/10 bg-ag-surface px-5 py-4 hover:border-ag-accent/50 hover:bg-white/5 transition-all duration-200 shadow-lg hover:shadow-glow-neon"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold text-ag-text">{p.name}</div>
                    {p.description && <div className="text-ag-muted text-sm line-clamp-1 mt-0.5">{p.description}</div>}
                  </div>
                  <span className="text-[10px] font-mono text-ag-muted/50 bg-white/5 px-1.5 py-0.5 rounded">#{p.id}</span>
                </div>
                {(p.alerts ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-red-300">
                      <span className="text-xs">⚠️</span> {p.alerts ?? 0} alerts
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10 bg-ag-surface">
            <table className="min-w-full text-sm text-slate-200">
              <thead className="bg-white/5 text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left">Project</th>
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
