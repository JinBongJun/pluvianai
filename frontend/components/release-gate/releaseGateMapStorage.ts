import type { Node } from "reactflow";

export function getReleaseGateStorageKey(projectId: number) {
  return `rg-node-positions-${projectId > 0 ? projectId : "default"}`;
}

export function getLegacyReleaseGateStorageKey(projectName?: string) {
  return `rg-node-positions-${projectName || "default"}`;
}

export function loadReleaseGateSavedPositions(options: {
  projectId: number;
  projectName?: string;
}): Record<string, { x: number; y: number }> {
  const { projectId, projectName } = options;
  try {
    const currentRaw = localStorage.getItem(getReleaseGateStorageKey(projectId));
    if (currentRaw) {
      return JSON.parse(currentRaw);
    }
    const legacyKey = getLegacyReleaseGateStorageKey(projectName);
    const legacyRaw = localStorage.getItem(legacyKey);
    if (!legacyRaw) return {};
    const parsed = JSON.parse(legacyRaw);
    localStorage.setItem(getReleaseGateStorageKey(projectId), JSON.stringify(parsed));
    return parsed;
  } catch {
    return {};
  }
}

export function saveReleaseGatePositions(
  nodes: Node[],
  options: { projectId: number; projectName?: string }
) {
  const { projectId, projectName } = options;
  try {
    const map: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      map[n.id] = { x: n.position.x, y: n.position.y };
    });
    localStorage.setItem(getReleaseGateStorageKey(projectId), JSON.stringify(map));
    const legacyKey = getLegacyReleaseGateStorageKey(projectName);
    if (legacyKey !== getReleaseGateStorageKey(projectId)) {
      localStorage.removeItem(legacyKey);
    }
  } catch {
    /* ignore quota / private mode */
  }
}
