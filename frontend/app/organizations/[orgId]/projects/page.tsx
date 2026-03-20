"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import OrgLayout from "@/components/layout/OrgLayout";
import { useOrgProjectParams } from "@/hooks/useOrgProjectParams";
import Button from "@/components/ui/Button";
import { clsx } from "clsx";
import { OrganizationDetail, OrganizationProject, organizationsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
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
  Settings,
  Check,
} from "lucide-react";

export type AlertFilter = "all" | "with_alerts" | "no_alerts";

export default function OrgProjectsPage() {
  const router = useRouter();
  const { orgId } = useOrgProjectParams();
  const [projectQuery, setProjectQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filterAlerts, setFilterAlerts] = useState<AlertFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const debouncedProjectQuery = useDebouncedValue(projectQuery, 300);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const {
    data: org,
    error: orgError,
    isValidating: orgLoading,
    mutate: refetchOrg,
  } = useSWR<OrganizationDetail>(orgId ? orgKeys.detail(orgId) : null, ([, , id]) =>
    organizationsAPI.get(id as string, { includeStats: false })
  );

  const {
    data: projects,
    error: projectsError,
    isValidating: projectsLoading,
    mutate: refetchProjects,
  } = useSWR<OrganizationProject[]>(
    orgId ? orgKeys.projects(orgId, debouncedProjectQuery) : null,
    ([, , id, search]) =>
      organizationsAPI.listProjects(id as string, { includeStats: false, search: search as string })
  );

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const q = debouncedProjectQuery.trim().toLowerCase();
    let list = projects;
    if (q) {
      list = list.filter(
        project =>
          project.name.toLowerCase().includes(q) || project.description?.toLowerCase().includes(q)
      );
    }
    if (filterAlerts === "with_alerts") {
      list = list.filter(p => (p.alerts ?? 0) > 0);
    } else if (filterAlerts === "no_alerts") {
      list = list.filter(p => (p.alerts ?? 0) === 0);
    }
    return list;
  }, [debouncedProjectQuery, projects, filterAlerts]);

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
      <div className="w-full max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,1)] animate-pulse" />
            <p className="text-[11px] font-black text-emerald-500 uppercase tracking-[0.4em]">
              Agent Workspaces
            </p>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Projects</h1>

          {/* Search and Actions Bar */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-xl group">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-500 group-focus-within:text-emerald-400 transition-colors z-20" />
                <input
                  id="project-search"
                  placeholder="Search projects..."
                  value={projectQuery}
                  onChange={e => setProjectQuery(e.target.value)}
                  className="w-full h-12 rounded-full border border-white/[0.15] bg-[#131316]/90 backdrop-blur-2xl px-6 py-2 pl-12 text-base text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none transition-all shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:border-white/30"
                />
                <div className="absolute inset-x-8 -bottom-px h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />
              </div>
              <div className="relative" ref={filterRef}>
                <button
                  type="button"
                  onClick={() => setFilterOpen(open => !open)}
                  aria-expanded={filterOpen}
                  aria-haspopup="true"
                  aria-label="Filter projects by alerts"
                  className={clsx(
                    "h-12 w-12 flex items-center justify-center rounded-full border bg-[#121215]/90 backdrop-blur-xl transition-all shadow-xl",
                    filterAlerts !== "all"
                      ? "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                      : "border-white/10 text-slate-500 hover:bg-white/5 hover:text-emerald-400"
                  )}
                >
                  <Filter className="h-4 w-4" />
                </button>
                {filterOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-2 min-w-[200px] rounded-xl border border-white/10 bg-[#121215]/98 backdrop-blur-xl shadow-xl z-50 py-2"
                  >
                    <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 border-b border-white/5">
                      Filter by alerts
                    </div>
                    {(
                      [
                        { value: "all" as const, label: "All projects" },
                        { value: "with_alerts" as const, label: "With alerts" },
                        { value: "no_alerts" as const, label: "No alerts" },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={filterAlerts === value}
                        onClick={() => {
                          setFilterAlerts(value);
                          setFilterOpen(false);
                        }}
                        className={clsx(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors",
                          filterAlerts === value
                            ? "bg-emerald-500/15 text-emerald-400 font-semibold"
                            : "text-slate-300 hover:bg-white/5 hover:text-white"
                        )}
                      >
                        {filterAlerts === value ? (
                          <Check className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <span className="w-4" />
                        )}
                        {label}
                      </button>
                    ))}
                    {filterAlerts !== "all" && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setFilterAlerts("all");
                          setFilterOpen(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-xs font-medium text-slate-500 hover:bg-white/5 hover:text-slate-300 border-t border-white/5"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-1 p-1.5 rounded-full border border-white/10 bg-[#121215]/90 backdrop-blur-xl shadow-xl">
                <button
                  onClick={() => setView("grid")}
                  className={clsx(
                    "p-3 rounded-full transition-all",
                    view === "grid"
                      ? "bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)]"
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                  )}
                >
                  <LayoutGrid className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={clsx(
                    "p-3 rounded-full transition-all",
                    view === "list"
                      ? "bg-emerald-500 text-black shadow-[0_0_25px_rgba(16,185,129,0.4)]"
                      : "text-slate-500 hover:text-white hover:bg-white/5"
                  )}
                >
                  <List className="h-5 w-5" />
                </button>
              </div>
              <Button
                onClick={() => router.push(`/organizations/${orgId}/projects/new`)}
                className="h-12 px-6 bg-emerald-500 hover:bg-emerald-400 text-black font-bold flex items-center gap-2 shadow-[0_0_30px_-5px_rgba(16,185,129,0.4)] rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="w-5 h-5" />
                <span className="text-sm tracking-widest uppercase">NEW PROJECT</span>
              </Button>
            </div>
          </div>
        </div>

        {(orgError || projectsError) && (
          <div className="mb-8 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-base text-red-200 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <span>
                {orgError instanceof Error ? orgError.message : "Failed to load organization"}
                {projectsError && (
                  <span className="ml-2 font-bold">
                    ({projectsError instanceof Error ? projectsError.message : "Project error"})
                  </span>
                )}
              </span>
              <button
                onClick={() => {
                  refetchOrg();
                  refetchProjects();
                }}
                className="ml-auto underline text-red-400 hover:text-red-300 font-black uppercase tracking-widest text-xs"
              >
                Retry Scan
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="grid gap-6 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="h-64 animate-pulse rounded-xl bg-white/5 border border-white/10"
              />
            ))}
          </div>
        )}

        {/* Alerts section */}
        {org?.alerts && org.alerts.length > 0 && (
          <div>
            <div className="rounded-xl border border-white/10 bg-[#121215]/60 p-6 backdrop-blur-2xl shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-red-500/5 opacity-20" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-black uppercase tracking-widest text-slate-400">
                      Security Alerts
                    </span>
                    <span className="rounded-full bg-red-500 text-black px-4 py-1 text-xs font-black uppercase tracking-tighter shadow-[0_0_15px_rgba(239,68,68,0.4)]">
                      {org.alerts.length} CRITICAL
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      if (firstProjectId) {
                        router.push(`/organizations/${orgId}/projects/${firstProjectId}/alerts`);
                      }
                    }}
                    className="text-xs font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    View all projects →
                  </button>
                </div>
                <div className="grid gap-3">
                  {org.alerts.map((a, idx) => (
                    <div
                      key={`${a.project}-${idx}`}
                      className="rounded-2xl border border-white/5 bg-white/5 px-6 py-4 text-sm text-slate-200 flex items-center justify-between group-hover:bg-white/[0.07] transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-white font-black uppercase tracking-tight">
                          {a.project || "Unknown project"}
                        </span>
                      </div>
                      <span className="text-slate-400 font-medium italic">
                        {a.summary || "Alert detected"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!filteredProjects.length && !loading ? (
          <div className="rounded-[32px] border-2 border-dashed border-white/5 bg-white/[0.01] p-24 text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-8 text-slate-600">
              <Info className="w-10 h-10" />
            </div>
            <p className="text-slate-500 text-2xl font-bold uppercase tracking-widest max-w-md mx-auto leading-relaxed">
              {projectQuery.trim()
                ? `No projects match "${projectQuery}".`
                : "No projects in this organization yet."}
            </p>
            {!projectQuery.trim() && (
              <button
                onClick={() => router.push(`/organizations/${orgId}/projects/new`)}
                className="mt-10 px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-full border border-white/10 transition-all font-black uppercase tracking-widest text-sm"
              >
                Initialize First Project
              </button>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
            {filteredProjects.map(p => (
              <div
                key={p.id}
                className="group relative rounded-xl bg-[#1a1a1e]/95 backdrop-blur-3xl border border-white/[0.15] transition-all duration-500 hover:border-emerald-500/40 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] hover:shadow-[0_0_60px_rgba(16,185,129,0.1)] overflow-hidden flex text-left active:scale-[0.99]"
              >
                {/* Top Rim Highlight (Persistent) */}
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-100 z-10" />
                <div className="absolute top-[1px] inset-x-10 h-16 bg-gradient-to-b from-white/[0.05] to-transparent pointer-events-none z-10" />

                {/* Internal Inner Glow Layer */}
                <div className="absolute inset-0.5 rounded-[38px] bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none z-0" />

                {/* Bottom Right Glow Element */}
                <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-emerald-500/10 group-hover:bg-emerald-500/20 blur-[60px] rounded-full transition-all duration-500 pointer-events-none" />

                {/* Card-level actions: quick settings */}
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    router.push(`/organizations/${orgId}/projects/${p.id}/settings/general`);
                  }}
                  className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-[#05070c]/80 border border-white/15 flex items-center justify-center text-slate-400 hover:text-white hover:border-emerald-500/40 transition-all"
                  title="Project settings"
                >
                  <Settings className="w-4 h-4" />
                </button>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/organizations/${orgId}/projects/${p.id}`);
                    }
                  }}
                  className="relative z-20 flex-1 p-6 flex items-center gap-6 cursor-pointer"
                >
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-white/[0.05] border border-white/10 group-hover:scale-110 group-hover:border-emerald-500/30 transition-all duration-500 text-emerald-400 flex-shrink-0 shadow-inner">
                    <Building2 className="w-7 h-7" />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-[12px] font-black tracking-[0.3em] text-slate-500 uppercase">
                        Project #{p.id}
                      </span>
                      {(p.alerts ?? 0) > 0 ? (
                        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-red-500/15 border border-red-500/30 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                          <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse" />
                          <span className="text-[10px] font-black text-red-400 uppercase tracking-[0.2em]">
                            {p.alerts} ALERTS
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5 px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,1)]" />
                          <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                            0 ALERTS
                          </span>
                        </div>
                      )}
                    </div>
                    <h3 className="text-2xl font-semibold text-white mb-3 tracking-tight uppercase group-hover:text-emerald-50 transition-colors leading-none">
                      {p.name}
                    </h3>
                    {p.description ? (
                      <p className="text-slate-400 text-sm font-medium line-clamp-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {p.description}
                      </p>
                    ) : (
                      <p className="text-slate-600 text-xs font-black uppercase tracking-widest opacity-40">
                        No description
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[32px] border border-white/[0.12] bg-[#0a0a0c]/90 backdrop-blur-xl shadow-2xl">
            <table className="min-w-full text-base text-slate-200">
              <thead className="bg-white/5 text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 border-b border-white/5">
                <tr>
                  <th className="px-10 py-6 text-left">Project Name</th>
                  <th className="px-10 py-6 text-left">Active Alerts</th>
                  <th className="px-10 py-6 text-right">Project</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredProjects.map(p => (
                  <tr
                    key={p.id}
                    className="group hover:bg-emerald-500/5 cursor-pointer transition-all"
                    onClick={() => router.push(`/organizations/${orgId}/projects/${p.id}`)}
                  >
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                          <Building2 className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-xl font-black text-white uppercase tracking-tight group-hover:text-emerald-400 transition-colors">
                            {p.name}
                          </div>
                          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">
                            ID: P-{String(p.id).padStart(4, "0")}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            "w-2 h-2 rounded-full",
                            (p.alerts ?? 0) > 0 ? "bg-red-500 animate-pulse" : "bg-emerald-500"
                          )}
                        />
                        <span
                          className={clsx(
                            "font-black uppercase tracking-widest text-xs",
                            (p.alerts ?? 0) > 0 ? "text-red-400" : "text-emerald-400"
                          )}
                        >
                          {(p.alerts ?? 0) > 0 ? `${p.alerts} ALERTS` : "0 ALERTS"}
                        </span>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <span className="text-[10px] font-black bg-white/5 border border-white/10 px-4 py-2 rounded-full text-slate-400 group-hover:text-white transition-colors">
                        PROTOCOL-#{p.id}
                      </span>
                    </td>
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
