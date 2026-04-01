"use client";

import { useLaboratoryPageBootstrap } from "@/hooks/useLaboratoryPageBootstrap";

export function useReleaseGatePageBootstrap(
  orgId: string,
  projectId: number,
  routerReplace: (href: string) => void
) {
  return useLaboratoryPageBootstrap({ orgId, projectId, routerReplace });
}
