"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import Button from "@/components/ui/Button";
import { clsx } from "clsx";
import { OrganizationDetail, OrganizationProject, organizationsAPI } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/useDebounce";
import {
  Search,
  Building2,
  LayoutGrid,
  List,
  Plus,
  Filter,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export default function OrgProjectsPage() {
  const router = useRouter();
  const params = useParams();
  const orgId = Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId;
  const [projectQuery, setProjectQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const debouncedProjectQuery = useDebouncedValue(projectQuery, 300);

  const {
    data: org,
    error: orgError,
    isValidating: orgLoading,
    mutate: refetchOrg,
  } = useSWR<OrganizationDetail>(orgId ? ["organization", orgId] : null, ([, id]) =>
    // The org header does not require stats, so load without stats to avoid extra DB pressure.
    organizationsAPI.get(id as string, { includeStats: false })
  );

  const {
    data: projects,
    error: projectsError,
    isValidating: projectsLoading,
    mutate: refetchProjects,
  } = useSWR<OrganizationProject[]>(
    orgId ? ["organization-projects", orgId, debouncedProjectQuery] : null,
    ([, id, search]) =>
      // Project cards only need base fields; enable stats later only if needed.
      organizationsAPI.listProjects(id as string, { includeStats: false, search: search as string })
  );

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const q = debouncedProjectQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      project =>
        project.name.toLowerCase().includes(q) || project.description?.toLowerCase().includes(q)
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
        { label: "Organizations", href: "/organizations" },
        { label: org?.name || "Organization" },
      ]}
    >
      <div className="max-w-6xl mx-auto">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,1)]" />
            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em]">
              Authorized Laboratory Operations
            </p>
          </div>
          <h1 className="text-5xl font-black mb-10 text-white uppercase tracking-tighter">
            Clinical Trials
          </h1>

          {/* Search and Actions Bar */}
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-md group">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4.5 w-4.5 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                <input
                  id="project-search"
                  placeholder="Scan for restricted trials..."
                  value={projectQuery}
                  onChange={e => setProjectQuery(e.target.value)}
                  className="w-full h-14 rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-3xl px-6 py-2 pl-12 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/30 focus:outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all"
                />
              </div>
              <button className="h-14 w-14 flex items-center justify-center rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-3xl hover:bg-white/10 transition-all text-slate-500 hover:text-emerald-400">
                <Filter className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 p-1 rounded-2xl border border-white/5 bg-white/[0.03] backdrop-blur-3xl">
                <button
                  onClick={() => setView("grid")}
                  className={clsx(
                    "p-3 rounded-xl transition-all",
                    view === "grid"
                      ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                  )}
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={clsx(
                    "p-3 rounded-xl transition-all",
                    view === "list"
                      ? "bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                  )}
                >
                  <List className="h-5 w-5" />
                </button>
              </div>
              <Button
                onClick={() => router.push(`/organizations/${orgId}/projects/new`)}
                className="h-14 px-8 bg-emerald-500 hover:bg-emerald-400 text-black font-black flex items-center gap-3 shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] rounded-2xl"
              >
                <Plus className="w-6 h-6" />
                <span>NEW PROJECT</span>
              </Button>
            </div>
          </div>
        </div>

        {(orgError || projectsError) && (
          <div className="mb-4 rounded-lg border border-red-900 bg-red-900/10 p-4 text-sm text-red-200">
            {orgError instanceof Error ? orgError.message : "Failed to load organization"}
            {projectsError && (
              <span className="ml-2">
                {projectsError instanceof Error ? projectsError.message : ""}
              </span>
            )}
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
                    <span className="text-ag-accentLight font-semibold">
                      {a.project || "Unknown project"}
                    </span>{" "}
                    — {a.summary || "Alert detected"}
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
                : "No projects yet. Create your first project to get started."}
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-8 sm:grid-cols-2">
            {filteredProjects.map(p => (
              <button
                key={p.id}
                onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                className="w-full text-left rounded-[40px] border border-white/10 bg-white/[0.05] p-10 hover:animate-heartbeat hover:border-emerald-500/40 transition-all duration-500 relative overflow-hidden group shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)] active:scale-[0.98] backdrop-blur-3xl"
              >
                {/* Secondary Internal Glass Layer */}
                <div className="absolute inset-2.5 bg-white/[0.02] border border-white/10 rounded-[32px] pointer-events-none z-0 group-hover:bg-white/[0.04] transition-all duration-500 backdrop-blur-xl" />

                {/* Animated Grid & Scanlines on Hover */}
                <div className="absolute inset-0 bg-flowing-lines-sharp opacity-0 group-hover:opacity-[0.2] transition-opacity duration-700 pointer-events-none z-0" />

                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-12">
                    <div className="w-20 h-20 rounded-2xl bg-white/[0.08] border border-white/10 flex items-center justify-center text-slate-500 group-hover:text-emerald-400 group-hover:border-emerald-500/40 transition-all duration-500 shadow-inner group-hover:shadow-[0_0_40px_-5px_rgba(16,185,129,0.4)]">
                      <Building2 className="w-10 h-10" />
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-black tracking-[0.3em] text-slate-600 bg-white/5 px-4 py-2 rounded-full uppercase border border-white/10 backdrop-blur-md mb-2">
                        Trial Protocol #{p.id}
                      </span>
                      <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/5 border border-emerald-500/10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">
                          Active Link
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-3xl font-black text-white uppercase tracking-tighter group-hover:text-emerald-400 transition-all duration-300">
                      {p.name}
                    </h3>
                    {p.description ? (
                      <p className="text-slate-500 text-sm font-bold uppercase tracking-widest line-clamp-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {p.description}
                      </p>
                    ) : (
                      <p className="text-slate-700 text-sm font-bold uppercase tracking-widest opacity-40">
                        No experimental briefing provided
                      </p>
                    )}
                  </div>

                  <div className="mt-12 group/ecg relative h-12 w-full flex items-center overflow-hidden rounded-xl bg-white/[0.02] border border-white/5">
                    {/* ECG Waveform SVG */}
                    <svg
                      className="absolute inset-0 w-full h-full"
                      preserveAspectRatio="none"
                      viewBox="0 0 1000 100"
                    >
                      {/* Ambient Waveform - Minimalist */}
                      <path
                        d="M0,50 L100,50 L110,40 L120,50 L130,50 L140,10 L150,90 L160,50 L170,50 L185,40 L200,50 L300,50 L310,40 L320,50 L330,50 L340,10 L350,90 L360,50 L370,50 L385,40 L400,50 L500,50 L510,40 L520,50 L530,50 L540,10 L550,90 L560,50 L570,50 L585,40 L600,50 L700,50 L710,40 L720,50 L730,50 L740,10 L750,90 L760,50 L770,50 L785,40 L800,50 L900,50 L910,40 L920,50 L930,50 L940,10 L950,90 L960,50 L970,50 L985,40 L1000,50"
                        fill="none"
                        stroke="rgba(16, 185, 129, 0.1)"
                        strokeWidth="1"
                      />
                      {/* Animated Trace on Hover */}
                      <path
                        d="M0,50 L100,50 L110,40 L120,50 L130,50 L140,10 L150,90 L160,50 L170,50 L185,40 L200,50 L300,50 L310,40 L320,50 L330,50 L340,10 L350,90 L360,50 L370,50 L385,40 L400,50 L500,50 L510,40 L520,50 L530,50 L540,10 L550,90 L560,50 L570,50 L585,40 L600,50 L700,50 L710,40 L720,50 L730,50 L740,10 L750,90 L760,50 L770,50 L785,40 L800,50 L900,50 L910,40 L920,50 L930,50 L940,10 L950,90 L960,50 L970,50 L985,40 L1000,50"
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          strokeDasharray: "1000",
                          animation:
                            "ecg-trace 4s linear infinite, medical-pulse 2s ease-in-out infinite",
                        }}
                      />
                    </svg>
                  </div>
                </div>
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
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(p => (
                  <tr
                    key={p.id}
                    className="hover:bg-white/5 cursor-pointer"
                    onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                  >
                    <td className="px-4 py-3">{p.name}</td>
                    <td className="px-4 py-3">{p.alerts ?? 0}</td>
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
