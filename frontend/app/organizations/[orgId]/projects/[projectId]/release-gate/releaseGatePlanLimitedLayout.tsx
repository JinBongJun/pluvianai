"use client";

import {
  ReleaseGateLayoutGateBody,
  type ReleaseGateLayoutGateBodyProps,
} from "./ReleaseGateLayoutGateBody";
import { ReleaseGatePlanLimitedScaffold } from "./ReleaseGatePlanLimitedScaffold";
import type { PlanLimitError } from "@/lib/planErrors";

export function ReleaseGatePlanLimitedLayout({
  planError,
  gateBodyProps,
}: {
  planError: PlanLimitError | null;
  gateBodyProps: ReleaseGateLayoutGateBodyProps;
}) {
  return (
    <ReleaseGatePlanLimitedScaffold planError={planError}>
      <ReleaseGateLayoutGateBody {...gateBodyProps} />
    </ReleaseGatePlanLimitedScaffold>
  );
}
