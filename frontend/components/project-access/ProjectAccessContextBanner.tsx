"use client";

import clsx from "clsx";

import {
  getAccessSourceLabel,
  getEntitlementScopeLabel,
  getProjectAccessSummary,
  getProjectRoleLabel,
  type AccessAwareProject,
} from "@/lib/projectAccess";

export function ProjectAccessContextBanner({
  project,
  className,
}: {
  project?: AccessAwareProject | null;
  className?: string;
}) {
  if (!project) return null;

  const roleLabel = project.role ? getProjectRoleLabel(project.role) : null;
  const sourceLabel = project.access_source ? getAccessSourceLabel(project.access_source) : null;
  const summary = getProjectAccessSummary(project);
  const entitlementLabel = getEntitlementScopeLabel(project.entitlement_scope);

  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {sourceLabel ? (
          <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
            {sourceLabel}
          </span>
        ) : null}
        {roleLabel ? (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
            Role: {roleLabel}
          </span>
        ) : (
          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
            No project role yet
          </span>
        )}
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-200">
          {entitlementLabel}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{summary}</p>
      {project.owner_name ? (
        <p className="mt-1 text-xs text-slate-400">Project owner: {project.owner_name}</p>
      ) : null}
    </div>
  );
}
