/**
 * Laboratory (Live View + Release Gate): unified agent-list refresh and canvas fit.
 * @see LaboratoryRefreshButton
 */

import type { ScopedMutator } from "swr";

export const LABORATORY_REFRESH_EVENT = "pluvian:laboratory-refresh";

export type LaboratoryRefreshDetail = { projectId: number };

export function liveViewAgentsSwrKey(projectId: number) {
  return ["live-view-agents", projectId] as const;
}

export function releaseGateAgentsSwrKey(projectId: number) {
  return ["release-gate-agents", projectId] as const;
}

/** Stable signature for Live View `getAgents` payload (ids + deleted flag) to detect list changes without extra RG fetches on unchanged polls. */
export function liveViewAgentsPayloadSignature(data: unknown): string {
  const raw = Array.isArray((data as { agents?: unknown })?.agents)
    ? (data as { agents: unknown[] }).agents
    : Array.isArray((data as { data?: { agents?: unknown[] } })?.data?.agents)
      ? (data as { data: { agents: unknown[] } }).data.agents
      : [];
  return (raw as { agent_id?: string; is_deleted?: boolean }[])
    .map(a => `${String(a.agent_id ?? "")}:${a.is_deleted ? "1" : "0"}`)
    .sort()
    .join("|");
}

export function releaseGateAgentsPayloadSignature(data: unknown): string {
  const items = Array.isArray((data as { items?: unknown })?.items)
    ? (data as { items: { agent_id?: string }[] }).items
    : [];
  return items
    .map(a => String(a.agent_id ?? ""))
    .sort()
    .join("|");
}

/** Revalidate both Live View and Release Gate agent-list SWR caches for a project. */
export async function revalidateLaboratoryAgentListCaches(
  scopedMutate: ScopedMutator,
  projectId: number
): Promise<void> {
  if (!projectId || Number.isNaN(projectId) || projectId <= 0) return;
  await Promise.all([
    scopedMutate(liveViewAgentsSwrKey(projectId)),
    scopedMutate(releaseGateAgentsSwrKey(projectId)),
  ]);
}
