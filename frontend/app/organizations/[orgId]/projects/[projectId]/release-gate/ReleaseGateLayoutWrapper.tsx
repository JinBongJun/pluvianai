"use client";

import React from "react";
import CanvasPageLayout from "@/components/layout/CanvasPageLayout";
import type { OrganizationProject, OrganizationSummary } from "@/lib/api";

type Props = {
  orgId: string;
  projectId: number;
  projectName?: string;
  orgName?: string;
  organizations?: OrganizationSummary[];
  projects?: OrganizationProject[];
  topRailMeta?: React.ReactNode;
  onAction?: (actionId: string) => void;
  children?: React.ReactNode;
};

export function ReleaseGateLayoutWrapper({
  orgId,
  projectId,
  projectName,
  orgName,
  organizations,
  projects,
  topRailMeta,
  onAction,
  children,
}: Props) {
  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={projectName}
      orgName={orgName}
      organizations={organizations}
      projects={projects}
      topRailMeta={topRailMeta}
      navigationVariant="side"
      showTelemetry={false}
      onAction={onAction ?? (() => {})}
      customActions={[]}
    >
      {children}
    </CanvasPageLayout>
  );
}
