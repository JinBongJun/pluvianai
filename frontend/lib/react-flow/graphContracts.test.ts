import { describe, expect, it } from "vitest";

import { mapAgentsToLiveViewNodes } from "@/app/organizations/[orgId]/projects/[projectId]/live-view/mapAgentsToLiveViewNodes";
import { mapAgentsToReleaseGateNodes } from "@/components/release-gate/mapAgentsToReleaseGateNodes";

describe("graph contracts across Live View and Release Gate", () => {
  it("does not blur nodes when nothing is selected in both surfaces", () => {
    const liveViewNodes = mapAgentsToLiveViewNodes({
      agentsList: [
        { agent_id: "a1", display_name: "Agent 1" },
        { agent_id: "a2", display_name: "Agent 2" },
      ],
      selectedAgentId: null,
      currentNodes: [],
      saved: {},
    });
    const releaseGateNodes = mapAgentsToReleaseGateNodes({
      agents: [
        { agent_id: "a1", display_name: "Agent 1" },
        { agent_id: "a2", display_name: "Agent 2" },
      ],
      selectedNodeId: null,
      currentNodes: [],
      saved: {},
    });

    expect(liveViewNodes.every(node => node.data?.blur === false)).toBe(true);
    expect(releaseGateNodes.every(node => node.data?.blur === false)).toBe(true);
  });

  it("keeps selected node unblurred in both surfaces", () => {
    const liveViewNodes = mapAgentsToLiveViewNodes({
      agentsList: [
        { agent_id: "a1", display_name: "Agent 1" },
        { agent_id: "a2", display_name: "Agent 2" },
      ],
      selectedAgentId: "a1",
      currentNodes: [],
      saved: {},
    });
    const releaseGateNodes = mapAgentsToReleaseGateNodes({
      agents: [
        { agent_id: "a1", display_name: "Agent 1" },
        { agent_id: "a2", display_name: "Agent 2" },
      ],
      selectedNodeId: "a1",
      currentNodes: [],
      saved: {},
    });

    expect(liveViewNodes.find(node => node.id === "a1")?.data).toMatchObject({ blur: false });
    expect(liveViewNodes.find(node => node.id === "a2")?.data).toMatchObject({ blur: true });
    expect(releaseGateNodes.find(node => node.id === "a1")?.data).toMatchObject({ blur: false });
    expect(releaseGateNodes.find(node => node.id === "a2")?.data).toMatchObject({ blur: true });
  });

  it("prefers existing positions over saved positions in both surfaces", () => {
    const currentNodes = [{ id: "a1", position: { x: 10, y: 20 }, data: {} }];
    const saved = { a1: { x: 90, y: 120 } };

    const liveViewNodes = mapAgentsToLiveViewNodes({
      agentsList: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedAgentId: null,
      currentNodes,
      saved,
    });
    const releaseGateNodes = mapAgentsToReleaseGateNodes({
      agents: [{ agent_id: "a1", display_name: "Agent 1" }],
      selectedNodeId: null,
      currentNodes,
      saved,
    });

    expect(liveViewNodes[0]?.position).toEqual({ x: 10, y: 20 });
    expect(releaseGateNodes[0]?.position).toEqual({ x: 10, y: 20 });
  });
});
