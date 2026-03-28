import { describe, expect, it } from "vitest";

import { describeMissingProviderKeyRequirements } from "./releaseGateProviderModel";

describe("describeMissingProviderKeyRequirements", () => {
  it("mentions node-scoped missing keys for detected runs", () => {
    const message = describeMissingProviderKeyRequirements([
      { provider: "google", agentId: "agent-A" },
    ]);

    expect(message).toContain("Google");
    expect(message).toContain("node agent-A");
    expect(message).toContain("project default key");
  });

  it("mentions direct API key option for custom runs", () => {
    const message = describeMissingProviderKeyRequirements(
      [{ provider: "openai", agentId: "agent-B" }],
      { allowDirectApiKey: true }
    );

    expect(message).toContain("Paste an API key for this run");
    expect(message).toContain("OpenAI");
  });
});
