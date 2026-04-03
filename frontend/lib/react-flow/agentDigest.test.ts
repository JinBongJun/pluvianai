import { describe, expect, it } from "vitest";

import { buildGraphAgentDigest } from "./agentDigest";

describe("buildGraphAgentDigest", () => {
  it("is stable regardless of input order", () => {
    const first = buildGraphAgentDigest([
      { agent_id: "b", total: 2, drift_status: "ghost" },
      { agent_id: "a", total: 1, drift_status: "official" },
    ]);
    const second = buildGraphAgentDigest([
      { agent_id: "a", total: 1, drift_status: "official" },
      { agent_id: "b", total: 2, drift_status: "ghost" },
    ]);

    expect(first).toBe(second);
  });

  it("changes when meaningful display fields change", () => {
    const before = buildGraphAgentDigest([
      { agent_id: "a", display_name: "Alpha", total: 1, last_seen: "2026-04-03T00:00:00Z" },
    ]);
    const after = buildGraphAgentDigest([
      { agent_id: "a", display_name: "Alpha v2", total: 1, last_seen: "2026-04-03T00:00:00Z" },
    ]);

    expect(before).not.toBe(after);
  });
});
