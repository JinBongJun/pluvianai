"use client";

import type { ReactNode } from "react";

import CanvasPageLayout from "@/components/layout/CanvasPageLayout";

export type LiveViewPageLayoutProps = {
  readonly orgId: string;
  readonly projectId: number;
  readonly projectName?: string;
  readonly orgName?: string;
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
  rightPanel,
  children,
}: LiveViewPageLayoutProps) {
  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={projectName}
      orgName={orgName}
      activeTab="live-view"
      showTelemetry={false}
      navigationVariant="side"
      onAction={actionId => {
        console.log("Live HUD Action:", actionId);
      }}
      customActions={[]}
      rightPanel={rightPanel}
    >
      {children}
    </CanvasPageLayout>
  );
}
