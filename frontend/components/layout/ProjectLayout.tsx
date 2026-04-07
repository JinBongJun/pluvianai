// Layout - ProjectLayout
"use client";

import React from "react";
import useSWR from "swr";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { projectsAPI } from "@/lib/api";
import {
  buildCanonicalProjectPath,
  getProjectScopeMismatchOrgId,
} from "@/lib/projectRouteScope";

interface Breadcrumb {
  label: string;
  href?: string;
}

export interface ProjectLayoutProps {
  orgId: string;
  projectId: number;
  basePath?: string;
  breadcrumb?: Breadcrumb[];
  tabs?: any[];
  children: React.ReactNode;
}

const ProjectLayout: React.FC<ProjectLayoutProps> = ({
  orgId,
  projectId,
  basePath,
  breadcrumb,
  tabs,
  children,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useSWR(
    orgId && projectId ? ["project-route-scope", projectId, orgId] : null,
    async () => {
      try {
        return await projectsAPI.get(projectId, { expectedOrgId: orgId });
      } catch (error: any) {
        const actualOrgId = getProjectScopeMismatchOrgId(error);
        if (actualOrgId && pathname) {
          router.replace(
            buildCanonicalProjectPath(
              pathname,
              orgId,
              actualOrgId,
              projectId,
              searchParams?.toString() ? `?${searchParams.toString()}` : ""
            )
          );
          return undefined;
        }

        const status = error?.response?.status;
        const msg = error?.response?.data?.detail ?? error?.response?.data?.error?.message ?? "";
        if (status === 404 && (msg === "Project not found" || msg === "Not Found")) {
          router.replace(orgId ? `/organizations/${orgId}/projects` : "/organizations");
          return undefined;
        }

        throw error;
      }
    },
    {
      revalidateOnFocus: false,
    }
  );

  return (
    <div className="min-h-screen bg-[#0d0d12]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {breadcrumb && (
          <nav className="mb-4 text-sm text-slate-400">
            {breadcrumb.map((item, index) => (
              <span key={index}>
                {index > 0 && <span className="mx-2">/</span>}
                {item.href ? (
                  <a href={item.href} className="hover:text-white">
                    {item.label}
                  </a>
                ) : (
                  <span className="text-white">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {children}
      </div>
    </div>
  );
};

export default ProjectLayout;
