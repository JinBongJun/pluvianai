import type { ScopedMutator } from "swr";
import type { PlanType } from "@/lib/api/types";
import { organizationsAPI, projectsAPI } from "@/lib/api";
import { orgKeys } from "@/lib/queryKeys";
import { safeReplace } from "@/lib/navigation";

type Mutate = ScopedMutator;

/**
 * Revalidate all SWR entries for an org's project list (`orgKeys.projects(orgId, anySearch)`).
 * Call after creating or updating a project so OrgLayout / project list pages stay in sync without a full reload.
 */
export function revalidateOrganizationProjectLists(mutate: Mutate, orgId: string) {
  return mutate(
    (key: unknown) =>
      Array.isArray(key) &&
      key[0] === "organizations" &&
      key[1] === "projects" &&
      key[2] === String(orgId),
    undefined,
    { revalidate: true }
  );
}

type Toast = {
  showToast: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
};
type Router = { replace: (href: string) => void; push: (href: string) => void };

export async function createOrganization(
  data: { name: string; description?: string | null; plan_type?: PlanType },
  ctx: { mutate: Mutate; router: Router }
): Promise<{ id: number }> {
  const org = await organizationsAPI.create({
    name: data.name.trim(),
    description: data.description?.trim() || null,
    plan_type: (data.plan_type || "free") as PlanType,
  });
  ctx.mutate(orgKeys.list());
  ctx.router.push(`/organizations/${org.id}/projects`);
  return org;
}

export async function renameOrganization(
  orgId: string,
  payload: { name: string },
  ctx: { mutate: Mutate }
): Promise<void> {
  await organizationsAPI.update(orgId, { name: payload.name.trim() });
  ctx.mutate(orgKeys.detail(orgId));
  ctx.mutate(orgKeys.list());
}

export async function deleteOrganization(
  orgId: string,
  ctx: { mutate: Mutate; router: Router; toast: Toast }
): Promise<void> {
  await organizationsAPI.delete(orgId);
  ctx.toast.showToast(
    "Environment archived. Permanent deletion is scheduled after the safety grace period.",
    "success"
  );
  ctx.mutate(
    (key: unknown) =>
      Array.isArray(key) &&
      key[0] === "organizations" &&
      (key.includes(String(orgId)) || key.includes(orgId)),
    undefined,
    { revalidate: false }
  );
  ctx.mutate(
    orgKeys.list(),
    (prev: unknown) => {
      if (!Array.isArray(prev)) return prev;
      return prev.filter(
        (item: { id?: unknown }) => item.id !== orgId && String(item.id) !== String(orgId)
      );
    },
    { revalidate: false }
  );
  safeReplace(ctx.router, "/organizations");
}

export async function deleteProject(
  orgId: string,
  projectId: number,
  ctx: { mutate: Mutate; router: Router; toast: Toast }
): Promise<void> {
  await projectsAPI.delete(projectId);
  ctx.toast.showToast("Project deleted", "success");
  ctx.mutate(
    (key: unknown) =>
      Array.isArray(key) &&
      key.some(part => part === projectId || part === Number(projectId)),
    undefined,
    { revalidate: false }
  );
  ctx.mutate(
    (key: unknown) =>
      Array.isArray(key) &&
      key[0] === "organizations" &&
      key[1] === "projects" &&
      key[2] === String(orgId),
    undefined,
    { revalidate: false }
  );
  const target = orgId ? `/organizations/${orgId}/projects` : "/organizations";
  safeReplace(ctx.router, target);
}

export async function inviteOrganizationMember(
  orgId: string,
  payload: { email: string; role: string },
  ctx: { mutate: Mutate }
): Promise<void> {
  await organizationsAPI.inviteMember(orgId, payload);
  ctx.mutate(orgKeys.members(orgId));
}

export async function removeOrganizationMember(
  orgId: string,
  memberId: number,
  ctx: { mutate: Mutate }
): Promise<void> {
  await organizationsAPI.removeMember(orgId, memberId);
  ctx.mutate(orgKeys.members(orgId));
}
