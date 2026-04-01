export type OrganizationRole = "owner" | "admin" | "member" | "viewer" | null | undefined;

export function canManageOrganization(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin";
}
