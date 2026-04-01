"use client";

import { extractApiErrorPayload } from "@/lib/api/client";

export type ProjectRole = "owner" | "admin" | "member" | "viewer";
export type AccessSource = "owned" | "project_member" | "organization_member";
export type EntitlementScope = "account" | "organization";

export type AccessAwareProject = {
  name?: string | null;
  role?: ProjectRole | null;
  org_role?: ProjectRole | null;
  access_source?: AccessSource | null;
  created_by_me?: boolean | null;
  has_project_access?: boolean | null;
  owner_name?: string | null;
  entitlement_scope?: EntitlementScope | null;
};

type PermissionErrorDetails = {
  code: string | null;
  message: string | null;
  currentRole: ProjectRole | null;
  requiredRoles: ProjectRole[];
  accessSource: AccessSource | null;
  orgRole: ProjectRole | null;
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export const ROLE_DESCRIPTIONS: Record<ProjectRole, string> = {
  owner: "Full control over organization settings, billing, member access, and shared project policy.",
  admin: "Can manage members and most day-to-day project operations without owning the workspace.",
  member: "Can work inside assigned projects and collaborate on validation and release workflows.",
  viewer: "Read-only access for monitoring, review, and audit use cases.",
};

export const SOURCE_LABELS: Record<AccessSource, string> = {
  owned: "Created by you",
  project_member: "Shared directly with you",
  organization_member: "Visible via organization",
};

export function getProjectRoleLabel(role?: string | null): string {
  if (!role) return "No project role";
  const normalized = role.toLowerCase() as ProjectRole;
  return ROLE_LABELS[normalized] ?? role;
}

export function getAccessSourceLabel(source?: string | null): string {
  if (!source) return "Access context unavailable";
  const normalized = source.toLowerCase() as AccessSource;
  return SOURCE_LABELS[normalized] ?? source.replace(/_/g, " ");
}

export function getEntitlementScopeLabel(scope?: string | null): string {
  return scope === "organization" ? "Uses workspace plan limits" : "Uses your account plan limits";
}

export function getEntitlementScopeHelpText(scope?: string | null): string {
  return scope === "organization"
    ? "Limits for this shared project follow the workspace plan."
    : "Limits for this shared project currently follow the signed-in member's account plan.";
}

export function getProjectRoleContextSummary(project?: AccessAwareProject | null): string {
  if (!project) return "Role details unavailable.";

  const projectRoleLabel = project.role ? getProjectRoleLabel(project.role) : null;
  const orgRoleLabel = project.org_role ? getProjectRoleLabel(project.org_role) : null;

  if (projectRoleLabel && orgRoleLabel && projectRoleLabel !== orgRoleLabel) {
    return `Project role: ${projectRoleLabel}. Organization role: ${orgRoleLabel}.`;
  }
  if (projectRoleLabel && orgRoleLabel) {
    return `Project role: ${projectRoleLabel}. Organization role: ${orgRoleLabel}.`;
  }
  if (projectRoleLabel) {
    return `Project role: ${projectRoleLabel}.`;
  }
  if (orgRoleLabel) {
    return `Organization role: ${orgRoleLabel}.`;
  }
  return "Role details unavailable.";
}

export function getProjectAccessSummary(project?: AccessAwareProject | null): string {
  if (!project) return "Access details unavailable.";
  if (project.access_source === "owned") {
    return "You created this project and have full project access.";
  }
  if (project.access_source === "project_member") {
    return "You have direct project access to this project.";
  }
  if (project.access_source === "organization_member") {
    return project.has_project_access === false
      ? "This project is visible because you belong to the organization, but you have not been added to the project itself."
      : "This project is visible through your organization membership.";
  }
  return "Access details unavailable.";
}

function parsePermissionError(error: unknown): PermissionErrorDetails {
  const { code, message, details } = extractApiErrorPayload(error as any);
  const payload =
    details && typeof details?.details === "object" && details.details !== null
      ? (details.details as Record<string, unknown>)
      : (details as Record<string, unknown> | null);
  const currentRole =
    typeof payload?.current_role === "string" ? (payload.current_role as ProjectRole) : null;
  const requiredRoles = Array.isArray(payload?.required_roles)
    ? (payload.required_roles.filter(role => typeof role === "string") as ProjectRole[])
    : [];
  const accessSource =
    typeof payload?.access_source === "string" ? (payload.access_source as AccessSource) : null;
  const orgRole = typeof payload?.org_role === "string" ? (payload.org_role as ProjectRole) : null;
  return { code, message, currentRole, requiredRoles, accessSource, orgRole };
}

export function getProjectAccessErrorCopy(options: {
  featureLabel: string;
  project?: AccessAwareProject | null;
  error?: unknown;
}): { title: string; description: string } {
  const { featureLabel, project, error } = options;
  const parsed = parsePermissionError(error);
  const accessSource = parsed.accessSource ?? project?.access_source ?? null;
  const currentRole = parsed.currentRole ?? project?.role ?? null;
  const requiredRoles = parsed.requiredRoles;
  const roleText = currentRole ? getProjectRoleLabel(currentRole) : null;
  const ownerName = project?.owner_name?.trim() || "a project owner";

  if (accessSource === "organization_member" && project?.has_project_access === false) {
    return {
      title: "Project Access Required",
      description: `This project appears because you belong to the organization, but you have not been added to the project itself. Ask ${ownerName} or another project admin to grant project access before using ${featureLabel}.`,
    };
  }

  if (parsed.code === "PROJECT_ROLE_INSUFFICIENT" && currentRole) {
    const requiredText =
      requiredRoles.length > 0 ? requiredRoles.map(getProjectRoleLabel).join(" or ") : "a higher role";
    return {
      title: `${featureLabel} Needs More Access`,
      description: `Your current role is ${roleText}. ${featureLabel} requires ${requiredText}. Ask ${ownerName} or another project admin to update your project role.`,
    };
  }

  if (parsed.code === "PROJECT_ACCESS_DENIED" && accessSource === "organization_member") {
    return {
      title: "Project Access Required",
      description: `This project is visible through organization membership, but you do not currently have project-level access. Ask ${ownerName} or another project admin to add you before using ${featureLabel}.`,
    };
  }

  if (parsed.message) {
    return {
      title: "Access Denied",
      description: parsed.message,
    };
  }

  return {
    title: "Access Denied",
    description: `You do not have access to ${featureLabel}. Ask ${ownerName} or another project admin to review your role.`,
  };
}
