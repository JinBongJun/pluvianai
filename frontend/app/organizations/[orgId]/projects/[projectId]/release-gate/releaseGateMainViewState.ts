import type { GateTab } from "./releaseGateExpandedHelpers";
import type { ReleaseGateMapRgDetails } from "./releaseGateExpandedMapRgDetails";

export function shouldResetReleaseGateMainTab(prevAgentId: string, nextAgentId: string): boolean {
  return Boolean(prevAgentId && nextAgentId && prevAgentId !== nextAgentId);
}

export function getReleaseGateMainViewState({
  agentId,
  tab,
}: {
  agentId: string;
  tab: GateTab;
}) {
  const hasSelectedAgent = Boolean(agentId.trim());
  const showSelectedAgentSurface = hasSelectedAgent && tab === "validate";
  const showHistoryExplorer = hasSelectedAgent && tab === "history";

  return {
    hasSelectedAgent,
    showSelectedAgentSurface,
    showHistoryExplorer,
  };
}

export function getReleaseGateSelectedAgentSurfacePhase(
  rgDetails: ReleaseGateMapRgDetails | null
): "pending" | "ready" {
  return rgDetails?.config ? "ready" : "pending";
}
