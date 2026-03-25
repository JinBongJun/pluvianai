import type { Node } from "reactflow";

export const LV_GRID_SPACING_X = 300;
export const LV_GRID_SPACING_Y = 200;
export const LV_GRID_COLS = 3;

export function getLvStorageKey(projectId: number) {
  return `lv-node-positions-${projectId}`;
}

export function loadLvPositions(projectId: number): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(getLvStorageKey(projectId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLvPositions(nodes: Node[], projectId: number) {
  try {
    const map: Record<string, { x: number; y: number }> = {};
    nodes.forEach(n => {
      map[n.id] = { x: n.position.x, y: n.position.y };
    });
    localStorage.setItem(getLvStorageKey(projectId), JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}
