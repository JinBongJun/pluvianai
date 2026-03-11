"use client";

import React from "react";
import CanvasPageLayout from "@/components/layout/CanvasPageLayout";

type Props = {
  orgId: string;
  projectId: number;
  projectName?: string;
  orgName?: string;
  onAction?: (actionId: string) => void;
  children?: React.ReactNode;
};

export function ReleaseGateLayoutWrapper({
  orgId,
  projectId,
  projectName,
  orgName,
  onAction,
  children,
}: Props) {
  return (
    <CanvasPageLayout
      orgId={orgId}
      projectId={projectId}
      projectName={projectName}
      orgName={orgName}
      navigationVariant="side"
      showTelemetry={false}
      onAction={onAction ?? (() => {})}
      customActions={[]}
    >
      {children}
    </CanvasPageLayout>
  );
}
