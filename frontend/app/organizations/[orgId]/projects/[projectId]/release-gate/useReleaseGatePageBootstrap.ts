"use client";

import { useLaboratoryPageBootstrap } from "@/hooks/useLaboratoryPageBootstrap";
import { LIVE_VIEW_SWR_DEFAULT_OPTIONS } from "../live-view/liveViewSwr.defaults";

export function useReleaseGatePageBootstrap(
  orgId: string,
  projectId: number,
  routerReplace: (href: string) => void
) {
  return useLaboratoryPageBootstrap({
    orgId,
    projectId,
    routerReplace,
    swrOptions: LIVE_VIEW_SWR_DEFAULT_OPTIONS,
    deferSwitcherData: true,
  });
}
