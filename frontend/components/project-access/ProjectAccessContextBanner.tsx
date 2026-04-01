"use client";

import clsx from "clsx";

import {
  getProjectAccessSummary,
  getEntitlementScopeHelpText,
  type AccessAwareProject,
} from "@/lib/projectAccess";
import {
  AccessSourceBadge,
  EntitlementScopeBadge,
  ProjectRoleBadge,
} from "@/components/project-access/AccessBadges";

export function ProjectAccessContextBanner({
  project,
  className,
}: {
  project?: AccessAwareProject | null;
  className?: string;
}) {
  if (!project) return null;

  const summary = getProjectAccessSummary(project);
  const entitlementHelpText = getEntitlementScopeHelpText(project.entitlement_scope);

  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AccessSourceBadge source={project.access_source} />
        <ProjectRoleBadge role={project.role} />
        <EntitlementScopeBadge scope={project.entitlement_scope} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-200">{summary}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{entitlementHelpText}</p>
      {project.owner_name ? (
        <p className="mt-1 text-xs text-slate-400">Project owner: {project.owner_name}</p>
      ) : null}
    </div>
  );
}
