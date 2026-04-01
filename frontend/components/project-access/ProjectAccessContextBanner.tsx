"use client";

import clsx from "clsx";

import {
  getProjectAccessSummary,
  getEntitlementScopeHelpText,
  getProjectRoleContextSummary,
  type AccessAwareProject,
} from "@/lib/projectAccess";
import {
  AccessSourceBadge,
  EntitlementScopeBadge,
  ProjectRoleBadge,
} from "@/components/project-access/AccessBadges";

export function ProjectAccessContextBanner({
  project,
  variant = "default",
  className,
}: {
  project?: AccessAwareProject | null;
  variant?: "default" | "compact";
  className?: string;
}) {
  if (!project) return null;

  const summary = getProjectAccessSummary(project);
  const entitlementHelpText = getEntitlementScopeHelpText(project.entitlement_scope);
  const roleContextSummary = getProjectRoleContextSummary(project);
  const isCompact = variant === "compact";

  return (
    <div
      className={clsx(
        isCompact
          ? "rounded-xl border border-white/10 bg-black/35 px-3.5 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)]"
          : "rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-md shadow-[0_12px_30px_rgba(0,0,0,0.28)]",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <AccessSourceBadge source={project.access_source} />
        <ProjectRoleBadge role={project.role ?? project.org_role} />
        <EntitlementScopeBadge scope={project.entitlement_scope} />
      </div>
      <p className={clsx("mt-2 leading-relaxed text-slate-200", isCompact ? "text-xs" : "text-sm")}>
        {summary}
      </p>
      <p className={clsx("mt-1 leading-relaxed text-slate-400", isCompact ? "text-[11px]" : "text-xs")}>
        {roleContextSummary}
      </p>
      <p className={clsx("mt-1 leading-relaxed text-slate-400", isCompact ? "text-[11px]" : "text-xs")}>
        {entitlementHelpText}
      </p>
      {project.owner_name ? (
        <p className={clsx("mt-1 text-slate-400", isCompact ? "text-[11px]" : "text-xs")}>
          Project owner: {project.owner_name}
        </p>
      ) : null}
    </div>
  );
}
