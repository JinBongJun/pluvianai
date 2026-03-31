import { describe, expect, it } from "vitest";

import {
  buildRunEvalElementsFromAgentEval,
  getConfiguredEvalCheckIds,
  isCanonicalEvalCheckId,
  isRuntimeOnlyEvalCheckId,
} from "./releaseGateEvalChecks";

describe("releaseGateEvalChecks", () => {
  it("builds visible eval elements from enabled config checks", () => {
    const result = buildRunEvalElementsFromAgentEval({
      config: {
        empty: { enabled: true },
        latency: { enabled: true },
        status_code: { enabled: true },
        refusal: { enabled: true },
        json: { enabled: false },
        length: { enabled: false },
        repetition: { enabled: false },
        required: { enabled: false },
        format: { enabled: false },
        leakage: { enabled: false },
        tool: { enabled: false },
      },
    });

    expect(result.map(row => row.name)).toEqual(["empty", "latency", "status_code", "refusal"]);
  });

  it("marks runtime-only checks outside canonical eval coverage", () => {
    expect(isCanonicalEvalCheckId("empty")).toBe(true);
    expect(isCanonicalEvalCheckId("tool_grounding")).toBe(false);
    expect(isRuntimeOnlyEvalCheckId("tool_grounding")).toBe(true);
    expect(isRuntimeOnlyEvalCheckId("required_keywords")).toBe(true);
    expect(isRuntimeOnlyEvalCheckId("required_json_fields")).toBe(true);
  });

  it("filters configured eval ids down to canonical checks", () => {
    expect(getConfiguredEvalCheckIds(["empty", "tool_grounding", "required", "", null])).toEqual([
      "empty",
      "required",
    ]);
  });
});
