import type { Node } from "reactflow";
import { describe, expect, it } from "vitest";

import { mapAgentsToLiveViewNodes } from "./mapAgentsToLiveViewNodes";

describe("mapAgentsToLiveViewNodes", () => {
  it("returns empty array for empty agents", () => {
    expect(
      mapAgentsToLiveViewNodes({
        agentsList: [],
        selectedAgentId: null,
        currentNodes: [],
        saved: {},
      })
    ).toEqual([]);
  });

  it("uses saved position when there is no existing node", () => {
    const nodes = mapAgentsToLiveViewNodes({
      agentsList: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedAgentId: null,
      currentNodes: [],
      saved: { a1: { x: 42, y: 99 } },
    });
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.position).toEqual({ x: 42, y: 99 });
    expect(nodes[0]?.data).toMatchObject({ label: "Agent 1" });
  });

  it("prefers existing React Flow node position over saved default grid", () => {
    const existing: Node = {
      id: "a1",
      position: { x: 5, y: 6 },
      data: {},
    };
    const nodes = mapAgentsToLiveViewNodes({
      agentsList: [{ agent_id: "a1" }],
      selectedAgentId: null,
      currentNodes: [existing],
      saved: { a1: { x: 100, y: 200 } },
    });
    expect(nodes[0]?.position).toEqual({ x: 5, y: 6 });
  });

  it("sets blur on non-selected nodes when one agent is selected", () => {
    const nodes = mapAgentsToLiveViewNodes({
      agentsList: [{ agent_id: "a1" }, { agent_id: "a2" }],
      selectedAgentId: "a1",
      currentNodes: [],
      saved: {},
      gridSpacingX: 10,
      gridSpacingY: 20,
      gridCols: 10,
    });
    const n1 = nodes.find(n => n.id === "a1");
    const n2 = nodes.find(n => n.id === "a2");
    expect(n1?.data).toMatchObject({ blur: false });
    expect(n2?.data).toMatchObject({ blur: true });
  });
});
