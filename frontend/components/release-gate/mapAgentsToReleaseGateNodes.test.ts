import type { Node } from "reactflow";
import { describe, expect, it } from "vitest";

import { mapAgentsToReleaseGateNodes } from "./mapAgentsToReleaseGateNodes";

describe("mapAgentsToReleaseGateNodes", () => {
  it("uses saved position when present", () => {
    const nodes = mapAgentsToReleaseGateNodes({
      agents: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedNodeId: null,
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

    const nodes = mapAgentsToReleaseGateNodes({
      agents: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedNodeId: null,
      currentNodes: [existingNode],
      saved: { a1: { x: 100, y: 200 } },
    });

    expect(nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it("places a new node in the next free grid slot when default slot is occupied", () => {
    const existingNode: Node = {
      id: "existing",
      position: { x: 0, y: 0 },
      data: {},
    };

    const nodes = mapAgentsToReleaseGateNodes({
      agents: [
        { agent_id: "existing", display_name: "Existing" },
        { agent_id: "new-agent", display_name: "New Agent" },
      ],
      selectedNodeId: null,
      currentNodes: [existingNode],
      saved: {},
      gridSpacingX: 300,
      gridSpacingY: 200,
      gridCols: 3,
    });

    expect(nodes.find(node => node.id === "new-agent")?.position).toEqual({ x: 300, y: 0 });
  });

  it("avoids stacking multiple newly added nodes onto the same slot", () => {
    const existingNode: Node = {
      id: "existing",
      position: { x: 0, y: 0 },
      data: {},
    };

    const nodes = mapAgentsToReleaseGateNodes({
      agents: [
        { agent_id: "existing", display_name: "Existing" },
        { agent_id: "new-a", display_name: "New A" },
        { agent_id: "new-b", display_name: "New B" },
      ],
      selectedNodeId: null,
      currentNodes: [existingNode],
      saved: {},
      gridSpacingX: 300,
      gridSpacingY: 200,
      gridCols: 3,
    });

    const newAPosition = nodes.find(node => node.id === "new-a")?.position;
    const newBPosition = nodes.find(node => node.id === "new-b")?.position;

    expect(newAPosition).toEqual({ x: 300, y: 0 });
    expect(newBPosition).toEqual({ x: 600, y: 0 });
  });

  it("marks non-selected nodes as blurred", () => {
    const nodes = mapAgentsToReleaseGateNodes({
      agents: [
        { agent_id: "a1", display_name: "Agent 1" },
        { agent_id: "a2", display_name: "Agent 2" },
      ],
      selectedNodeId: "a1",
      currentNodes: [],
      saved: {},
    });

    expect(nodes.find(node => node.id === "a1")?.data).toMatchObject({ blur: false });
    expect(nodes.find(node => node.id === "a2")?.data).toMatchObject({ blur: true });
  });
});
