"use client";

import clsx from "clsx";

import type { AccessAwareProject } from "@/lib/projectAccess";
import {
  getEntitlementScopeHelpText,
  getProjectAccessSummary,
  getProjectRoleContextSummary,
} from "@/lib/projectAccess";
import {
  AccessSourceBadge,
  EntitlementScopeBadge,
  ProjectRoleBadge,
} from "@/components/project-access/AccessBadges";

export function ProjectAccessInlineStrip({
  project,
  className,
}: {
  project?: AccessAwareProject | null;
  className?: string;
}) {
  if (!project) return null;

  const tooltip = [
    getProjectAccessSummary(project),
    getProjectRoleContextSummary(project),
    getEntitlementScopeHelpText(project.entitlement_scope),
    project.owner_name ? `Project owner: ${project.owner_name}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className={clsx(
        "flex max-w-[min(100vw-2rem,540px)] flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/35 px-3 py-2 backdrop-blur-md",
        className
      )}
      title={tooltip}
    >
      <AccessSourceBadge source={project.access_source} />
      <ProjectRoleBadge role={project.role ?? project.org_role} emptyLabel="Role unavailable" />
      <EntitlementScopeBadge scope={project.entitlement_scope} />
    </div>
  );
}
