/**
 * Centralized SWR query keys for org/project data.
 * Use these helpers everywhere to avoid key drift and stale cache bugs.
 */
export const orgKeys = {
  root: ["organizations"] as const,
  list: () => [...orgKeys.root, "list"] as const,
  detail: (orgId: string | number) => [...orgKeys.root, "detail", String(orgId)] as const,
  projects: (orgId: string | number, search = "") =>
    [...orgKeys.root, "projects", String(orgId), search] as const,
  members: (orgId: string | number) => [...orgKeys.root, "members", String(orgId)] as const,
};

export const projectKeys = {
  root: ["projects"] as const,
  detail: (projectId: number) => [...projectKeys.root, "detail", Number(projectId)] as const,
};
