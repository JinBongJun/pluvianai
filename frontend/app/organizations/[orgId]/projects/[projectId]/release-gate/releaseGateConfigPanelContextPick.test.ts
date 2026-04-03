import { describe, expect, it } from "vitest";

import type { ReleaseGateKeysContextValue } from "./ReleaseGateKeysContext";
import { pickReleaseGateConfigPanelContext } from "./releaseGateConfigPanelContextPick";
import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import type { ReleaseGateValidateRunContextValue } from "./ReleaseGateValidateRunContext";

function vctxBase(overrides: Partial<ReleaseGateValidateRunContextValue> = {}): ReleaseGateValidateRunContextValue {
  const isValidating = overrides.isValidating ?? false;
  const activeJobId = overrides.activeJobId ?? null;
  return {
    isValidating,
    runLocked: overrides.runLocked ?? (isValidating || Boolean(activeJobId)),
    activeJobId,
    cancelRequested: false,
    cancelLocked: false,
    handleValidate: () => {},
    handleCancelActiveJob: undefined,
    error: "",
    result: null,
    completedResults: [],
    hasCompletedResults: false,
    dismissResult: () => {},
    removeCompletedResult: () => {},
    ...overrides,
  };
}

function kctxBase(overrides: Partial<ReleaseGateKeysContextValue> = {}): ReleaseGateKeysContextValue {
  return {
    keyBlocked: false,
    keyIssueBlocked: false,
    keyRegistrationMessage: "",
    missingProviderKeyDetails: [],
    ...overrides,
  };
}

/** Only fields read by `pickReleaseGateConfigPanelContext` need to be realistic; rest are cast. */
function ctxPickFixture(
  overrides: Partial<Record<string, unknown>> = {}
): ReleaseGatePageContextValue {
  const base = {
    baselineSeedSnapshot: null as Record<string, unknown> | null,
    REPLAY_PROVIDER_MODEL_LIBRARY: {
      openai: ["gpt-4o"],
      anthropic: [],
      google: [],
    },
    REPLAY_THRESHOLD_PRESETS: {
      default: { label: "Default", failRateMax: 0.1, flakyRateMax: 0.05 },
    },
    thresholdPreset: "default",
    setThresholdPreset: () => {},
    normalizeGateThresholds: (f: unknown, fl: unknown) => ({
      failRateMax: Number(f),
      flakyRateMax: Number(fl),
    }),
    failRateMax: 0.1,
    setFailRateMax: () => {},
    flakyRateMax: 0.05,
    setFlakyRateMax: () => {},
    newModel: "",
    setNewModel: () => {},
    modelSource: "detected",
    setModelSource: () => {},
    modelOverrideEnabled: false,
    setModelOverrideEnabled: () => {},
    replayModelMode: "hosted",
    setReplayModelMode: () => {},
    replayProvider: "openai",
    setReplayProvider: () => {},
    replayUserApiKeyId: null,
    setReplayUserApiKeyId: () => {},
    replayApiKey: "",
    setReplayApiKey: () => {},
    projectUserApiKeysForUi: [],
    canValidate: true,
    mutateProjectUserApiKeys: async () => undefined,
    requestBody: {},
    setRequestBody: () => {},
    requestBodyJson: "{}",
    requestJsonDraft: null,
    setRequestJsonDraft: () => {},
    requestJsonError: "",
    requestBodyOverrides: {},
    requestBodyOverridesJson: "{}",
    bodyOverridesJsonDraft: null,
    setBodyOverridesJsonDraft: () => {},
    bodyOverridesJsonError: "",
    setBodyOverridesJsonError: () => {},
    requestBodyOverridesBySnapshotId: {} as Record<string, Record<string, unknown>>,
    bodyOverridesSnapshotDraftRaw: {} as Record<string, string>,
    setBodyOverridesSnapshotDraftRaw: () => {},
    bodyOverridesSnapshotJsonError: {} as Record<string, string>,
    setBodyOverridesSnapshotJsonError: () => {},
    handleBodyOverridesJsonBlur: () => {},
    handleBodyOverridesSnapshotBlur: () => {},
    applyLoadedGlobalBodyOverrides: () => {},
    applyLoadedSnapshotBodyOverrides: () => {},
    clearBodyOverrides: () => {},
    resetParitySharedOverridesToBaseline: () => {},
    resetParityPerLogOverridesToBaseline: () => {},
    resetParityToolsToBaseline: () => {},
    resetParityToolContextToBaseline: () => {},
    baselineSnapshotsById: new Map<string, Record<string, unknown>>(),
    handleRequestJsonBlur: () => {},
    applySystemPromptToBody: (b: Record<string, unknown>) => b,
    requestSystemPrompt: "",
    toolsList: [],
    setToolsList: () => {},
    runDataProvider: "openai",
    runDataModel: "gpt-4o",
    runDataPrompt: "sys",
    baselinePayload: null,
    finalCandidateRequest: null,
    baselineConfigSummary: "",
    validateOverridePreview: {},
    selectedBaselineCount: 0,
    selectedDataSummary: "",
    repeatRuns: 0,
    toolContextMode: "recorded" as const,
    setToolContextMode: () => {},
    toolContextScope: "per_snapshot" as const,
    setToolContextScope: () => {},
    toolContextGlobalText: "",
    setToolContextGlobalText: () => {},
    toolContextBySnapshotId: {},
    setToolContextBySnapshotId: () => {},
    toolContextLoadBusy: false,
    handleLoadToolContextFromSnapshots: () => {},
    selectedSnapshotIdsForRun: [] as string[],
    representativeBaselineUserSnapshotId: null,
    setRepresentativeBaselineUserSnapshotId: () => {},
    autoRepresentativeBaselineSnapshotId: null,
    representativeBaselinePickerOptions: [] as { id: string; createdAt: string }[],
    projectId: 42,
    runSnapshotIds: ["99"] as string[],
  };
  return { ...base, ...overrides } as unknown as ReleaseGatePageContextValue;
}

describe("pickReleaseGateConfigPanelContext", () => {
  it("sets runLocked when validating or job active", () => {
    const ctx = ctxPickFixture();
    expect(pickReleaseGateConfigPanelContext(ctx, vctxBase(), kctxBase()).runLocked).toBe(false);
    expect(pickReleaseGateConfigPanelContext(ctx, vctxBase({ isValidating: true }), kctxBase()).runLocked).toBe(true);
    expect(pickReleaseGateConfigPanelContext(ctx, vctxBase({ activeJobId: "job-1" }), kctxBase()).runLocked).toBe(
      true
    );
  });

  it("derives representativeBaselineId from baseline seed snapshot", () => {
    const ctx = ctxPickFixture({
      baselineSeedSnapshot: { id: 7 },
    });
    const p = pickReleaseGateConfigPanelContext(ctx, vctxBase(), kctxBase());
    expect(p.representativeBaselineId).toBe("7");
    expect(p.baselineSeedSnapshotForOverview).toEqual({ id: 7 });
  });

  it("defaults thresholdPreset when missing on context", () => {
    const ctx = ctxPickFixture({ thresholdPreset: undefined });
    const p = pickReleaseGateConfigPanelContext(ctx, vctxBase(), kctxBase());
    expect(p.thresholdPreset).toBe("default");
  });

  it("coerces projectId and repeatRuns", () => {
    const ctx = ctxPickFixture({ projectId: 0, repeatRuns: 3 });
    const p = pickReleaseGateConfigPanelContext(ctx, vctxBase(), kctxBase());
    expect(p.projectId).toBe(0);
    expect(p.repeatRuns).toBe(3);
  });
});
