import { describe, expect, it } from "vitest";

import {
  formatEvalRuleSummary,
  getEnabledCheckIdsFromConfig,
  getEvalCheckLabel,
  getEvalCheckParams,
  getEvalDetail,
  normalizeEvalConfig,
  normalizeEvalConfigKey,
  normalizeEvalDisplayId,
} from "./evalPresentation";

describe("evalPresentation", () => {
  it("normalizes display ids and config keys for tool policy", () => {
    expect(normalizeEvalDisplayId("tool_use_policy")).toBe("tool");
    expect(normalizeEvalConfigKey("tool")).toBe("tool_use_policy");
  });

  it("normalizes eval config with defaults", () => {
    const normalized = normalizeEvalConfig({
      latency: { enabled: true, fail_ms: 9000 },
      tool_use_policy: { enabled: false },
    });

    expect(normalized.empty.min_chars).toBe(16);
    expect(normalized.latency.fail_ms).toBe(9000);
    expect(normalized.tool_use_policy.enabled).toBe(false);
    expect(normalized.length.fail_ratio).toBe(0.75);
  });

  it("returns enabled check ids in stable display order", () => {
    const enabled = getEnabledCheckIdsFromConfig({
      tool_use_policy: { enabled: true },
      repetition: { enabled: true },
      empty: { enabled: true },
      json: { enabled: false },
    });

    expect(enabled).toEqual(["empty", "repetition", "tool"]);
  });

  it("formats legacy and modern config summaries with fail thresholds", () => {
    expect(formatEvalRuleSummary("latency", { crit_ms: 5000 })).toBe("fail ≥ 5.0s");
    expect(formatEvalRuleSummary("status_code", { fail_from: 500 })).toBe("fail ≥500");
    expect(formatEvalRuleSummary("json", { mode: "if_json" })).toBe("auto-detect JSON");
  });

  it("builds human-readable parameter summaries", () => {
    expect(getEvalCheckParams("required", { keywords_csv: "error,failed", json_fields_csv: "id" })).toBe(
      "2 keywords + 1 JSON field"
    );
    expect(getEvalCheckParams("format", { sections_csv: "summary,details" })).toBe(
      "2 required sections"
    );
  });

  it("formats eval details with legacy fallback and user-friendly wording", () => {
    const latency = getEvalDetail(
      { response_text: "hello", latency_ms: 1800 },
      "latency",
      { latency: { crit_ms: 5000 } }
    );
    expect(latency).toEqual({ actualStr: "1800ms", configStr: "fail ≥ 5000ms" });

    const json = getEvalDetail({ response_text: "{\"ok\":true}" }, "json", {
      json: { mode: "if_json" },
    });
    expect(json).toEqual({ actualStr: "—", configStr: "auto-detect JSON" });

    const tool = getEvalDetail({ response_text: "" }, "tool", {
      tool_use_policy: { enabled: true },
    });
    expect(tool.configStr).toContain("policy-only");
  });

  it("returns shared labels for display ids", () => {
    expect(getEvalCheckLabel("tool_use_policy")).toBe("Tool Use Policy");
    expect(getEvalCheckLabel("required")).toBe("Required Keywords / Fields");
  });
});
