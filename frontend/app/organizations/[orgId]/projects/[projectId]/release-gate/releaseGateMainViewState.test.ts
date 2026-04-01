import { describe, expect, it } from "vitest";

import { getReleaseGateMainViewState, shouldResetReleaseGateMainTab } from "./releaseGateMainViewState";

describe("releaseGateMainViewState", () => {
  it("shows validate surface for selected agent in validate mode", () => {
    expect(getReleaseGateMainViewState({ agentId: "agent-1", tab: "validate" })).toEqual({
      hasSelectedAgent: true,
      showSelectedAgentSurface: true,
      showHistoryExplorer: false,
    });
  });

  it("shows history explorer for selected agent in history mode", () => {
    expect(getReleaseGateMainViewState({ agentId: "agent-1", tab: "history" })).toEqual({
      hasSelectedAgent: true,
      showSelectedAgentSurface: false,
      showHistoryExplorer: true,
    });
  });

  it("resets main tab only when a different agent is selected", () => {
    expect(shouldResetReleaseGateMainTab("", "agent-1")).toBe(false);
    expect(shouldResetReleaseGateMainTab("agent-1", "agent-1")).toBe(false);
    expect(shouldResetReleaseGateMainTab("agent-1", "agent-2")).toBe(true);
  });
});
