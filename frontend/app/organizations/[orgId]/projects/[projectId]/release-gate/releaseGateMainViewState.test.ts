import { describe, expect, it } from "vitest";

import {
  getReleaseGateMainViewState,
  getReleaseGateSelectedAgentSurfacePhase,
  shouldResetReleaseGateMainTab,
} from "./releaseGateMainViewState";

describe("releaseGateMainViewState", () => {
  it("shows the selected-agent surface whenever an agent is selected", () => {
    expect(getReleaseGateMainViewState({ agentId: "agent-1" })).toEqual({
      hasSelectedAgent: true,
      showSelectedAgentSurface: true,
    });
    expect(getReleaseGateMainViewState({ agentId: "" })).toEqual({
      hasSelectedAgent: false,
      showSelectedAgentSurface: false,
    });
  });

  it("resets main tab only when a different agent is selected", () => {
    expect(shouldResetReleaseGateMainTab("", "agent-1")).toBe(false);
    expect(shouldResetReleaseGateMainTab("agent-1", "agent-1")).toBe(false);
    expect(shouldResetReleaseGateMainTab("agent-1", "agent-2")).toBe(true);
  });

  it("exposes a pending phase when selected-agent details are not ready yet", () => {
    expect(getReleaseGateSelectedAgentSurfacePhase(null)).toBe("pending");
    expect(
      getReleaseGateSelectedAgentSurfacePhase({
        provider: "openai",
        model: "gpt-4o",
        prompt: "",
        toolsCount: 0,
        activeChecks: [],
        activeChecksCards: [],
        policyChecks: [],
        policyCheckCards: [],
        strictnessLabel: "Default",
        failRateMax: 0.2,
        flakyRateMax: 0.1,
        config: {
          lastRunWallMs: null,
          lastRunStatusLabel: "",
          configSourceLabel: "",
          selectedBaselineCount: 0,
          selectedDataSummary: "",
          samplingSummary: "",
          toolsSummary: "",
          overrideSummary: "",
          originalPayloadPreview: "{}",
          runError: "",
          repeatRuns: 1,
          repeatDropdownOpen: false,
          setRepeatDropdownOpen: () => {},
          repeatDropdownRef: { current: null },
          REPEAT_OPTIONS: [1],
          isHeavyRepeat: false,
          canRunValidate: false,
          keyBlocked: false,
          keyIssueBlocked: false,
          keyRegistrationMessage: "",
          isValidating: false,
          handleValidate: () => {},
          activeJobId: null,
          cancelRequested: false,
          handleCancel: undefined,
          handleRepeatSelect: () => {},
          modelSource: "detected",
          openSettings: () => {},
        },
      })
    ).toBe("ready");
  });
});
