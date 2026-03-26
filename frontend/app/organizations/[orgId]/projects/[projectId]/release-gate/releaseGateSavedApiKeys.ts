import type { ProjectUserApiKeyItem } from "./useReleaseGateProjectApiKeys";

/** Keys created from Release Gate Custom (BYOK) — project-scoped, not Live View node keys. */
export const RELEASE_GATE_SAVED_API_KEY_NAME_PREFIX = "[RG]";

export function isReleaseGateSavedProjectKey(
  k: ProjectUserApiKeyItem,
  replayProvider: string
): boolean {
  if (!k.is_active) return false;
  if ((k.agent_id || "").trim()) return false;
  if (String(k.provider || "").trim().toLowerCase() !== replayProvider) return false;
  return (k.name || "").trim().startsWith(RELEASE_GATE_SAVED_API_KEY_NAME_PREFIX);
}
