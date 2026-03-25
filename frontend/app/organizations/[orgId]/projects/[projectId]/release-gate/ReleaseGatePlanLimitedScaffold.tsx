"use client";

import React from "react";

import { PlanLimitBanner } from "@/components/PlanLimitBanner";
import type { PlanLimitError } from "@/lib/planErrors";

export function ReleaseGatePlanLimitedScaffold({
  planError,
  children,
}: {
  planError: PlanLimitError | null;
  children?: React.ReactNode;
}) {
  if (!planError) return <>{children}</>;
  return (
    <>
      <div className="px-4 pt-4">
        <PlanLimitBanner {...planError} context="replay" />
      </div>
      {children}
    </>
  );
}
