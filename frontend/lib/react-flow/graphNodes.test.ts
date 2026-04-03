import { describe, expect, it } from "vitest";
import type { Node } from "reactflow";

import { buildGridLayout, cloneNodeSnapshots, syncNodeSelectionState } from "./graphNodes";

function createNode(id: string, x = 0, y = 0): Node {
  return {
    id,
    position: { x, y },
    data: { label: id },
    type: "agentCard",
  };
}

describe("graphNodes helpers", () => {
  it("clones node positions for history snapshots", () => {
    const nodes = [createNode("a", 10, 20)];

    const cloned = cloneNodeSnapshots(nodes);
    nodes[0]!.position.x = 999;

    expect(cloned[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it("builds a grid layout with configurable spacing", () => {
    const nodes = [createNode("a"), createNode("b"), createNode("c")];

    const laidOut = buildGridLayout(nodes, { spacingX: 300, spacingY: 200, cols: 2 });

    expect(laidOut.map(node => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 200 },
    ]);
  });

  it("syncs selected state and blur flags", () => {
    const nodes = [createNode("a"), createNode("b")];

    const synced = syncNodeSelectionState(nodes, "b");

    expect(synced[0]?.selected).toBe(false);
    expect(synced[0]?.data).toMatchObject({ blur: true });
    expect(synced[1]?.selected).toBe(true);
    expect(synced[1]?.data).toMatchObject({ blur: false });
  });
});
