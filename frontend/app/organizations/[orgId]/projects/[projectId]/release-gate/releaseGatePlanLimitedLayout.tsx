"use client";

import {
  ReleaseGateLayoutGateBody,
  type ReleaseGateLayoutGateBodyProps,
} from "./ReleaseGateLayoutGateBody";

export function ReleaseGatePlanLimitedLayout({
  gateBodyProps,
}: {
  gateBodyProps: ReleaseGateLayoutGateBodyProps;
}) {
  return <ReleaseGateLayoutGateBody {...gateBodyProps} />;
}
