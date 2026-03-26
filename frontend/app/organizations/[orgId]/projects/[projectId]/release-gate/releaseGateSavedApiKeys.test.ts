import { describe, expect, it } from "vitest";

import { isReleaseGateSavedProjectKey } from "./releaseGateSavedApiKeys";
import type { ProjectUserApiKeyItem } from "./useReleaseGateProjectApiKeys";

function key(p: Partial<ProjectUserApiKeyItem>): ProjectUserApiKeyItem {
  return {
    id: 1,
    provider: "openai",
    is_active: true,
    ...p,
  };
}

describe("isReleaseGateSavedProjectKey", () => {
  it("matches project-scoped [RG] keys for the replay provider", () => {
    expect(isReleaseGateSavedProjectKey(key({ name: "[RG] staging", agent_id: null }), "openai")).toBe(true);
  });

  it("rejects Live View node-scoped keys", () => {
    expect(isReleaseGateSavedProjectKey(key({ name: "[RG] x", agent_id: "node-1" }), "openai")).toBe(false);
  });

  it("rejects keys without the [RG] prefix", () => {
    expect(isReleaseGateSavedProjectKey(key({ name: "My key", agent_id: null }), "openai")).toBe(false);
  });
});
