"use client";

import type { ReactNode } from "react";

import CanvasPageLayout from "@/components/layout/CanvasPageLayout";
import type { OrganizationProject, OrganizationSummary } from "@/lib/api";

export type LiveViewPageLayoutProps = {
  readonly orgId: string;
  readonly projectId: number;
  readonly projectName?: string;
  readonly orgName?: string;
  readonly organizations?: OrganizationSummary[];
  readonly projects?: OrganizationProject[];
  readonly topRailMeta?: ReactNode;
  /** Right-rail (`RailwaySidePanel` + tab panels). */
  readonly rightPanel: ReactNode;
  /** Main canvas column (background, overlays, `ReactFlow`). */
  readonly children: ReactNode;
};

/**
 * Live View shell: {@link CanvasPageLayout} with fixed tab/navigation settings for this route.
 */
export function LiveViewPageLayout({
  orgId,
  projectId,
  projectName,
  orgName,
  organizations,
  projects,
  topRailMeta,
  rightPanel,
  children,
}: LiveViewPageLayoutProps) {
  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={projectName}
      orgName={orgName}
      organizations={organizations}
      projects={projects}
      topRailMeta={topRailMeta}
      activeTab="live-view"
      showTelemetry={false}
      navigationVariant="side"
      customActions={[]}
      rightPanel={rightPanel}
    >
      {children}
    </CanvasPageLayout>
  );
}
