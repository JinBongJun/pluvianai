import { describe, expect, it } from "vitest";

import {
  buildReleaseGateValidateAsyncPayload,
  type ReleaseGateValidateAsyncPayloadInput,
} from "./releaseGateValidateAsyncPayload";

function base(): ReleaseGateValidateAsyncPayloadInput {
  return {
    modelOverrideEnabled: false,
    newModel: "",
    replayProvider: "openai",
    failRateMax: 0.1,
    flakyRateMax: 0.05,
    agentId: "agent-1",
    runSnapshotIds: ["snap-a"],
    runDatasetIds: [],
    requestBody: {
      system_prompt: "from body",
      temperature: 0.5,
      max_tokens: 64,
      top_p: 0.9,
    },
    requestSystemPrompt: "fallback",
    toolsList: [],
    requestBodyOverrides: {},
    requestBodyOverridesBySnapshotId: {},
    toolContextMode: "recorded",
    toolContextScope: "global",
    toolContextGlobalText: "",
    toolContextBySnapshotId: {},
    repeatRuns: 2,
  };
}

describe("buildReleaseGateValidateAsyncPayload", () => {
  it("uses detected model and snapshot_ids when override off", () => {
    const r = buildReleaseGateValidateAsyncPayload(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.model_source).toBe("detected");
    expect(r.payload.new_model).toBeUndefined();
    expect(r.payload.snapshot_ids).toEqual(["snap-a"]);
    expect(r.payload.dataset_ids).toBeUndefined();
    expect(r.payload.repeat_runs).toBe(2);
    expect(r.payload.evaluation_mode).toBe("replay_test");
    expect(r.payload.tool_context).toEqual({ mode: "recorded" });
  });

  it("prefers snapshot_ids over dataset_ids", () => {
    const r = buildReleaseGateValidateAsyncPayload({
      ...base(),
      runSnapshotIds: ["s"],
      runDatasetIds: ["d"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.snapshot_ids).toEqual(["s"]);
    expect(r.payload.dataset_ids).toBeUndefined();
  });

  it("sets dataset_ids when no snapshots", () => {
    const r = buildReleaseGateValidateAsyncPayload({
      ...base(),
      runSnapshotIds: [],
      runDatasetIds: ["d1"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.snapshot_ids).toBeUndefined();
    expect(r.payload.dataset_ids).toEqual(["d1"]);
  });

  it("adds platform override fields when enabled", () => {
    const r = buildReleaseGateValidateAsyncPayload({
      ...base(),
      modelOverrideEnabled: true,
      newModel: "  gpt-x  ",
      replayProvider: "anthropic",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.model_source).toBe("platform");
    expect(r.payload.new_model).toBe("gpt-x");
    expect(r.payload.replay_provider).toBe("anthropic");
  });

  it("returns error when tool parameters JSON is invalid", () => {
    const b = base();
    const r = buildReleaseGateValidateAsyncPayload({
      ...b,
      requestBody: { ...b.requestBody, tools: [] },
      toolsList: [{ id: "1", name: "foo", description: "", parameters: "not json" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("foo");
    expect(r.error).toContain("valid JSON");
  });

  it("uses requestBody.system_prompt over requestSystemPrompt", () => {
    const b = base();
    const r = buildReleaseGateValidateAsyncPayload({
      ...b,
      requestBody: { ...b.requestBody, system_prompt: "body prompt" },
      requestSystemPrompt: "should not use",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.new_system_prompt).toBe("body prompt");
  });

  it("falls back to requestSystemPrompt when body system_prompt is not a string", () => {
    const b = base();
    const r = buildReleaseGateValidateAsyncPayload({
      ...b,
      requestBody: { ...b.requestBody, system_prompt: 123 as unknown as string },
      requestSystemPrompt: "  fallback  ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.new_system_prompt).toBe("fallback");
  });

  it("omits new_system_prompt when empty after trim", () => {
    const b = base();
    const r = buildReleaseGateValidateAsyncPayload({
      ...b,
      requestBody: { ...b.requestBody, system_prompt: "   " },
      requestSystemPrompt: "",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.new_system_prompt).toBeUndefined();
  });

  it("includes replay_temperature, replay_max_tokens, and replay_top_p when valid", () => {
    const r = buildReleaseGateValidateAsyncPayload(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.replay_temperature).toBe(0.5);
    expect(r.payload.replay_max_tokens).toBe(64);
    expect(r.payload.replay_top_p).toBe(0.9);
  });
});
