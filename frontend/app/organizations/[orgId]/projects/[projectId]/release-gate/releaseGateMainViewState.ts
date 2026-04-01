import type { ReleaseGateMapRgDetails } from "./releaseGateExpandedMapRgDetails";

export function shouldResetReleaseGateMainTab(prevAgentId: string, nextAgentId: string): boolean {
  return Boolean(prevAgentId && nextAgentId && prevAgentId !== nextAgentId);
}

export function getReleaseGateMainViewState({
  agentId,
}: {
  agentId: string;
}) {
  const hasSelectedAgent = Boolean(agentId.trim());
  const showSelectedAgentSurface = hasSelectedAgent;

  return {
    hasSelectedAgent,
    showSelectedAgentSurface,
  };
}

export function getReleaseGateSelectedAgentSurfacePhase(
  rgDetails: ReleaseGateMapRgDetails | null
): "pending" | "ready" {
  return rgDetails?.config ? "ready" : "pending";
}
