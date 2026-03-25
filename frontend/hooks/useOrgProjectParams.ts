"use client";

import { useParams } from "next/navigation";

/**
 * Normalizes org/project route params from Next.js (which may be string | string[]).
 * Use in app/organizations/[orgId] and app/organizations/[orgId]/projects/[projectId] pages.
 */
export function useOrgProjectParams(): { orgId: string; projectId: number } {
  const params = useParams();
  const orgId = (Array.isArray(params?.orgId) ? params.orgId[0] : params?.orgId) as
    | string
    | undefined;
  const rawProjectId = Array.isArray(params?.projectId) ? params.projectId[0] : params?.projectId;
  const projectId =
    rawProjectId != null ? Number(rawProjectId) : 0;
  return {
    orgId: orgId ?? "",
    projectId: Number.isNaN(projectId) ? 0 : projectId,
  };
}
