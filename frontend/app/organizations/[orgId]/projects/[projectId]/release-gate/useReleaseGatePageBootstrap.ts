"use client";

import useSWR from "swr";

import { orgKeys } from "@/lib/queryKeys";
import { organizationsAPI, projectsAPI } from "@/lib/api";

export function useReleaseGatePageBootstrap(
  orgId: string,
  projectId: number,
  routerReplace: (href: string) => void
) {
  const { data: project } = useSWR(
    projectId && !isNaN(projectId) ? ["project", projectId] : null,
    async () => {
      try {
        return await projectsAPI.get(projectId);
      } catch (e: any) {
        const status = e?.response?.status;
        const msg = e?.response?.data?.detail ?? e?.response?.data?.error?.message ?? "";
        if (status === 404 && (msg === "Project not found" || msg === "Not Found")) {
          routerReplace(orgId ? `/organizations/${orgId}/projects` : "/organizations");
          return undefined;
        }
        throw e;
      }
    }
  );

  const { data: org } = useSWR(orgId ? orgKeys.detail(orgId) : null, () =>
    organizationsAPI.get(orgId)
  );

  return { project, org };
}
