import type { RefObject } from "react";

import type { ReleaseGateResult } from "@/lib/api";

import { EVAL_CHECK_LABELS, getEvalCheckParams } from "./releaseGateExpandedHelpers";
import { sanitizePayloadForPreview } from "./releaseGatePageContent.lib";

export type ExpandedMapActiveCheckCard = {
  id: string;
  label: string;
  params: string;
};

export function buildExpandedMapActiveChecksCards(
  runEvalElements: { name: string }[],
  agentEvalConfig: Record<string, unknown> | undefined
): ExpandedMapActiveCheckCard[] {
  return runEvalElements.map((e: { name: string }) => {
    const id = e.name;
    const label =
      EVAL_CHECK_LABELS[id] ??
      id.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase());
    const checkConfig = agentEvalConfig?.[id] as Record<string, unknown> | undefined;
    const params = getEvalCheckParams(id, checkConfig);
    return { id, label, params };
  });
}

export function buildExpandedMapSamplingSummary(requestBody: Record<string, unknown>): string {
  const samplingTemperature =
    typeof requestBody.temperature === "number" ? requestBody.temperature : undefined;
  const samplingMaxTokens =
    typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : undefined;
  const samplingTopP = typeof requestBody.top_p === "number" ? requestBody.top_p : undefined;
  if (samplingTemperature == null && samplingMaxTokens == null && samplingTopP == null) {
    return "Using provider defaults";
  }
  return [
    samplingTemperature != null ? `Temp ${samplingTemperature}` : null,
    samplingMaxTokens != null ? `Max ${samplingMaxTokens}` : null,
    samplingTopP != null ? `Top p ${samplingTopP}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function buildExpandedMapToolsSummary(toolsCount: number): string {
  return toolsCount > 0
    ? `${toolsCount} tool${toolsCount === 1 ? "" : "s"} configured`
    : "No tools configured";
}

function isPinnedAnthropicModelId(modelId: unknown): boolean {
  return /-\d{8}$/.test(String(modelId ?? "").trim());
}

export function buildExpandedMapOverrideSummary(
  modelSource: "detected" | "hosted" | "custom",
  replayProvider: string,
  newModel: string
): string {
  if (modelSource === "detected") return "Using detected model";
  if (modelSource === "hosted") return "Using hosted model";
  if (replayProvider === "anthropic") {
    return isPinnedAnthropicModelId(newModel) ? "Pinned BYOK model" : "Custom BYOK model";
  }
  return "Custom BYOK model";
}

export function buildExpandedMapLastRunStatusLabel(input: {
  isValidating: boolean;
  cancelRequested: boolean;
  runError: string;
  resultPass: boolean | undefined;
}): string {
  if (input.isValidating) return input.cancelRequested ? "Canceling" : "Running";
  if (input.runError) return "Failed";
  if (typeof input.resultPass === "boolean") return input.resultPass ? "Healthy" : "Flagged";
  return "";
}

export function buildExpandedMapOriginalPayloadPreviewJson(input: {
  baselinePayload: Record<string, unknown> | null;
  baselineSeedSnapshot: Record<string, unknown> | null;
  nodeBasePayload: Record<string, unknown> | null;
}): string {
  const rawSource =
    input.baselinePayload ??
    (input.baselineSeedSnapshot?.payload &&
    typeof input.baselineSeedSnapshot.payload === "object" &&
    !Array.isArray(input.baselineSeedSnapshot.payload)
      ? (input.baselineSeedSnapshot.payload as Record<string, unknown>)
      : null) ??
    input.nodeBasePayload;
  const clean = sanitizePayloadForPreview(rawSource);
  try {
    return JSON.stringify(clean, null, 2);
  } catch {
    return "{}";
  }
}

export type BuildReleaseGateMapRgDetailsInput = {
  agentId: string;
  runDataProvider: string | null;
  runDataModel: string;
  requestSystemPrompt: string;
  runDataPrompt: string;
  requestBody: Record<string, unknown>;
  runEvalElements: { name: string }[];
  agentEvalData: Record<string, unknown> | undefined;
  thresholdPreset: string;
  REPLAY_THRESHOLD_PRESETS: Record<string, { label: string }>;
  failRateMax: number;
  flakyRateMax: number;
  baselinePayload: Record<string, unknown> | null;
  baselineSeedSnapshot: Record<string, unknown> | null;
  nodeBasePayload: Record<string, unknown> | null;
  result: ReleaseGateResult | null;
  isValidating: boolean;
  cancelRequested: boolean;
  runError: string;
  configSourceLabel: string;
  selectedBaselineCount: number;
  selectedDataSummary: string;
  modelSource: "detected" | "hosted" | "custom";
  replayProvider: string;
  newModel: string;
  repeatRuns: number;
  repeatDropdownOpen: boolean;
  setRepeatDropdownOpen: (b: boolean) => void;
  repeatDropdownRef: RefObject<HTMLDivElement | null>;
  REPEAT_OPTIONS: readonly number[];
  isHeavyRepeat: boolean;
  canRunValidate: boolean;
  keyBlocked: boolean;
  keyRegistrationMessage: string;
  handleValidate: () => void;
  activeJobId: string | null;
  handleCancelActiveJob: (() => void) | undefined;
  handleRepeatSelect: (runs: number) => void;
  openSettings: () => void;
};

export type ReleaseGateMapRgDetails = {
  provider: string | null;
  model: string;
  prompt: string;
  toolsCount: number;
  activeChecks: string[];
  activeChecksCards: ExpandedMapActiveCheckCard[];
  strictnessLabel: string;
  failRateMax: number;
  flakyRateMax: number;
  config: {
    lastRunWallMs: number | null;
    lastRunStatusLabel: string;
    configSourceLabel: string;
    selectedBaselineCount: number;
    selectedDataSummary: string;
    samplingSummary: string;
    toolsSummary: string;
    overrideSummary: string;
    originalPayloadPreview: string;
    runError: string;
    repeatRuns: number;
    repeatDropdownOpen: boolean;
    setRepeatDropdownOpen: (b: boolean) => void;
    repeatDropdownRef: RefObject<HTMLDivElement | null>;
    REPEAT_OPTIONS: readonly number[];
    isHeavyRepeat: boolean;
    canRunValidate: boolean;
    keyBlocked: boolean;
    keyRegistrationMessage: string;
    isValidating: boolean;
    handleValidate: () => void;
    activeJobId: string | null;
    cancelRequested: boolean;
    handleCancel: (() => void) | undefined;
    handleRepeatSelect: (runs: number) => void;
    modelSource: "detected" | "hosted" | "custom";
    openSettings: () => void;
  };
};

export function buildReleaseGateMapRgDetails(
  p: BuildReleaseGateMapRgDetailsInput
): ReleaseGateMapRgDetails | null {
  if (!p.agentId?.trim()) return null;

  const requestTools = Array.isArray(p.requestBody.tools) ? p.requestBody.tools : [];
  const toolsCount = requestTools.length;
  const agentEvalConfig = p.agentEvalData?.config as Record<string, unknown> | undefined;
  const activeChecksCards = buildExpandedMapActiveChecksCards(p.runEvalElements, agentEvalConfig);
  const samplingSummary = buildExpandedMapSamplingSummary(p.requestBody);
  const toolsSummary = buildExpandedMapToolsSummary(toolsCount);
  const overrideSummary = buildExpandedMapOverrideSummary(
    p.modelSource,
    p.replayProvider,
    p.newModel
  );
  const lastRunStatusLabel = buildExpandedMapLastRunStatusLabel({
    isValidating: p.isValidating,
    cancelRequested: p.cancelRequested,
    runError: p.runError,
    resultPass: p.result?.pass,
  });
  const originalPayloadPreview = buildExpandedMapOriginalPayloadPreviewJson({
    baselinePayload: p.baselinePayload,
    baselineSeedSnapshot: p.baselineSeedSnapshot,
    nodeBasePayload: p.nodeBasePayload,
  });

  return {
    provider: p.runDataProvider,
    model: p.runDataModel,
    prompt: String(p.requestSystemPrompt || p.runDataPrompt || "").trim(),
    toolsCount,
    activeChecks: p.runEvalElements.map((e: { name: string }) => e.name),
    activeChecksCards,
    strictnessLabel: p.REPLAY_THRESHOLD_PRESETS[p.thresholdPreset]?.label ?? p.thresholdPreset,
    failRateMax: p.failRateMax,
    flakyRateMax: p.flakyRateMax,
    config: {
      lastRunWallMs: p.result?.perf?.total_wall_ms ?? null,
      lastRunStatusLabel,
      configSourceLabel: p.configSourceLabel,
      selectedBaselineCount: p.selectedBaselineCount,
      selectedDataSummary: p.selectedDataSummary,
      samplingSummary,
      toolsSummary,
      overrideSummary,
      originalPayloadPreview,
      runError: p.runError,
      repeatRuns: p.repeatRuns,
      repeatDropdownOpen: p.repeatDropdownOpen,
      setRepeatDropdownOpen: p.setRepeatDropdownOpen,
      repeatDropdownRef: p.repeatDropdownRef,
      REPEAT_OPTIONS: p.REPEAT_OPTIONS,
      isHeavyRepeat: p.isHeavyRepeat,
      canRunValidate: p.canRunValidate,
      keyBlocked: p.keyBlocked,
      keyRegistrationMessage: p.keyRegistrationMessage,
      isValidating: p.isValidating,
      handleValidate: p.handleValidate,
      activeJobId: p.activeJobId,
      cancelRequested: p.cancelRequested,
      handleCancel: p.handleCancelActiveJob,
      handleRepeatSelect: p.handleRepeatSelect,
      modelSource: p.modelSource,
      openSettings: p.openSettings,
    },
  };
}
