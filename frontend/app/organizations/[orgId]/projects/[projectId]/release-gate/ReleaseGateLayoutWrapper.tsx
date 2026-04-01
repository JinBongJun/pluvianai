"use client";

import React from "react";
import CanvasPageLayout from "@/components/layout/CanvasPageLayout";

type Props = {
  orgId: string;
  projectId: number;
  projectName?: string;
  orgName?: string;
  topRailMeta?: React.ReactNode;
  onAction?: (actionId: string) => void;
  children?: React.ReactNode;
};

export function ReleaseGateLayoutWrapper({
  orgId,
  projectId,
  projectName,
  orgName,
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
