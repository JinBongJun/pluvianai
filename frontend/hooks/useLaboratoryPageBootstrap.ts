"use client";

import useSWR from "swr";

import type { OrganizationProject, OrganizationSummary } from "@/lib/api";
import { organizationsAPI, projectsAPI } from "@/lib/api";
import { orgKeys, projectKeys } from "@/lib/queryKeys";

type UseLaboratoryPageBootstrapOptions = {
  orgId: string;
  projectId: number;
  routerReplace: (href: string) => void;
  swrOptions?: Record<string, unknown>;
};

export function useLaboratoryPageBootstrap(options: UseLaboratoryPageBootstrapOptions) {
  const { orgId, projectId, routerReplace, swrOptions } = options;

  const { data: project } = useSWR(
    projectId && !isNaN(projectId) ? projectKeys.detail(projectId) : null,
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
    },
    swrOptions
  );

  const { data: org } = useSWR(
    orgId ? orgKeys.detail(orgId) : null,
    () => organizationsAPI.get(orgId),
    swrOptions
  );

  const { data: organizations } = useSWR<OrganizationSummary[]>(
    orgId ? orgKeys.list() : null,
    () => organizationsAPI.list({ includeStats: false }),
    swrOptions
  );

  const { data: orgProjects } = useSWR<OrganizationProject[]>(
    orgId ? orgKeys.projects(orgId, "") : null,
    ([, , id]) => organizationsAPI.listProjects(String(id), { includeStats: false }),
    swrOptions
  );

  const projectSummary =
    orgProjects?.find(candidate => String(candidate.id) === String(projectId)) ?? undefined;

  return {
    project,
    org,
    organizations,
    orgProjects,
    projectSummary,
  };
}
