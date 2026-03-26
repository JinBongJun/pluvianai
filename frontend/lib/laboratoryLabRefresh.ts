/**
 * Laboratory (Live View + Release Gate): unified agent-list refresh and canvas fit.
 * @see LaboratoryRefreshButton
 */

export const LABORATORY_REFRESH_EVENT = "pluvian:laboratory-refresh";

export type LaboratoryRefreshDetail = { projectId: number };

export function liveViewAgentsSwrKey(projectId: number) {
  return ["live-view-agents", projectId] as const;
}

export function releaseGateAgentsSwrKey(projectId: number) {
  return ["release-gate-agents", projectId] as const;
}
