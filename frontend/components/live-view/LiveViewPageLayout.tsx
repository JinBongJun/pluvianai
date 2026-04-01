"use client";

import type { ReactNode } from "react";

import CanvasPageLayout from "@/components/layout/CanvasPageLayout";

export type LiveViewPageLayoutProps = {
  readonly orgId: string;
  readonly projectId: number;
  readonly projectName?: string;
  readonly orgName?: string;
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
