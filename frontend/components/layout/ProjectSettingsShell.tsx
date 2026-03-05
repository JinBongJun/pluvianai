"use client";

import React from "react";
import OrgLayout from "@/components/layout/OrgLayout";
import ProjectTabs from "@/components/ProjectTabs";

interface ProjectSettingsShellProps {
  orgId: string;
  projectId: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function ProjectSettingsShell({
  orgId,
  projectId,
  title,
  description,
  children,
}: ProjectSettingsShellProps) {
  const basePath = `/organizations/${orgId}/projects/${projectId}`;

  return (
    <OrgLayout orgId={orgId}>
      <div className="min-h-screen bg-ag-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <ProjectTabs projectId={projectId} orgId={orgId} basePath={basePath} />

          <div className="mt-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
              {description ? <p className="text-slate-400">{description}</p> : null}
            </div>
            {children}
          </div>
        </div>
      </div>
    </OrgLayout>
  );
}

