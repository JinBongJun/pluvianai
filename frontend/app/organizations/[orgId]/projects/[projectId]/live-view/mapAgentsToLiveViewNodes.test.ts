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

  it("uses saved position when present", () => {
    const nodes = mapAgentsToLiveViewNodes({
      agentsList: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedAgentId: null,
      currentNodes: [],
      saved: { a1: { x: 42, y: 88 } },
    });

    expect(nodes[0]?.position).toEqual({ x: 42, y: 88 });
  });

  it("prefers existing node position over saved position", () => {
    const existingNode: Node = {
      id: "a1",
      position: { x: 10, y: 20 },
      data: {},
    };

    const nodes = mapAgentsToLiveViewNodes({
      agentsList: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedAgentId: null,
      currentNodes: [existingNode],
      saved: { a1: { x: 100, y: 200 } },
    });

    expect(nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it("marks non-selected nodes as blurred", () => {
    const nodes = mapAgentsToLiveViewNodes({
      agentsList: [
        { agent_id: "a1", display_name: "Agent 1" },
        { agent_id: "a2", display_name: "Agent 2" },
      ],
      selectedAgentId: "a1",
      currentNodes: [],
      saved: {},
    });

    expect(nodes.find(node => node.id === "a1")?.data).toMatchObject({ blur: false });
    expect(nodes.find(node => node.id === "a2")?.data).toMatchObject({ blur: true });
  });
});
