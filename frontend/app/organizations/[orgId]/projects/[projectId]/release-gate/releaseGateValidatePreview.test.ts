import { describe, expect, it } from "vitest";

import { buildValidateOverridePreview } from "./releaseGateValidatePreview";

describe("buildValidateOverridePreview", () => {
  it("redacts direct replay_api_key for custom BYOK preview", () => {
    const preview = buildValidateOverridePreview({
      modelSource: "custom",
      newModel: "gpt-4o",
      replayProvider: "openai",
      replayApiKey: "sk-live-secret",
      replayUserApiKeyId: null,
      requestBody: {},
      requestSystemPrompt: "",
      toolsList: [],
      toolContextMode: "recorded",
      toolContextScope: "global",
      toolContextGlobalText: "",
      toolContextBySnapshotId: {},
      requestBodyOverrides: {},
      selectedSnapshotIdsForRun: [],
      requestBodyOverridesBySnapshotId: {},
    });

    expect(preview.replay_api_key).toBe("[provided]");
    expect(preview.replay_provider).toBe("openai");
    expect(preview.new_model).toBe("gpt-4o");
  });
});
