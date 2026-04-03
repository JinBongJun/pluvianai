import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLegacyReleaseGateStorageKey,
  getReleaseGateStorageKey,
  loadReleaseGateSavedPositions,
  saveReleaseGatePositions,
} from "./releaseGateMapStorage";

describe("releaseGateMapStorage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses project id for the stable storage key", () => {
    expect(getReleaseGateStorageKey(42)).toBe("rg-node-positions-42");
    expect(getLegacyReleaseGateStorageKey("Project Alpha")).toBe("rg-node-positions-Project Alpha");
  });

  it("migrates legacy project-name storage into the project-id key", () => {
    const store = new Map<string, string>([
      ["rg-node-positions-Project Alpha", JSON.stringify({ a1: { x: 10, y: 20 } })],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });

    const loaded = loadReleaseGateSavedPositions({ projectId: 42, projectName: "Project Alpha" });

    expect(loaded).toEqual({ a1: { x: 10, y: 20 } });
    expect(store.get("rg-node-positions-42")).toBe(JSON.stringify({ a1: { x: 10, y: 20 } }));
  });

  it("saves to the stable key and clears the legacy key", () => {
    const store = new Map<string, string>([
      ["rg-node-positions-Project Alpha", JSON.stringify({ a1: { x: 10, y: 20 } })],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });

    saveReleaseGatePositions(
      [{ id: "a2", position: { x: 30, y: 40 }, data: {} } as any],
      { projectId: 42, projectName: "Project Alpha" }
    );

    expect(store.get("rg-node-positions-42")).toBe(JSON.stringify({ a2: { x: 30, y: 40 } }));
    expect(store.has("rg-node-positions-Project Alpha")).toBe(false);
  });
});
