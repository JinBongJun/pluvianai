"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

import type { OrganizationProject, OrganizationSummary } from "@/lib/api";
import { organizationsAPI, projectsAPI } from "@/lib/api";
import { orgKeys, projectKeys } from "@/lib/queryKeys";

type UseLaboratoryPageBootstrapOptions = {
  orgId: string;
  projectId: number;
  routerReplace: (href: string) => void;
  swrOptions?: Record<string, unknown>;
  deferSwitcherData?: boolean;
};

export function useLaboratoryPageBootstrap(options: UseLaboratoryPageBootstrapOptions) {
  const { orgId, projectId, routerReplace, swrOptions, deferSwitcherData = false } = options;
  const [switcherFetchEnabled, setSwitcherFetchEnabled] = useState(
    Boolean(orgId) && !deferSwitcherData
  );

  useEffect(() => {
    if (!orgId) {
      setSwitcherFetchEnabled(false);
      return;
    }
    if (!deferSwitcherData) {
      setSwitcherFetchEnabled(true);
      return;
    }

    setSwitcherFetchEnabled(false);
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setSwitcherFetchEnabled(true);
    };

    if (typeof window !== "undefined" && typeof (window as any).requestIdleCallback === "function") {
      const idleId = (window as any).requestIdleCallback(enable, { timeout: 1500 });
      return () => {
        cancelled = true;
        if (typeof (window as any).cancelIdleCallback === "function") {
          (window as any).cancelIdleCallback(idleId);
        }
      };
    }

    const timer = window.setTimeout(enable, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferSwitcherData, orgId, projectId]);

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
    orgId && switcherFetchEnabled ? orgKeys.list() : null,
    () => organizationsAPI.list({ includeStats: false }),
    swrOptions
  );

  const { data: orgProjects } = useSWR<OrganizationProject[]>(
    orgId && switcherFetchEnabled ? orgKeys.projects(orgId, "") : null,
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
