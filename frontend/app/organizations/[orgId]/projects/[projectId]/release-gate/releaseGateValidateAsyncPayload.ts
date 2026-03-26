import type { ReleaseGateValidatePayload } from "@/lib/api/release-gate";
import {
  buildToolContextPayload,
  isHostedPlatformModel,
  normalizeGateThresholds,
  type EditableTool,
  type ReplayProvider,
} from "./releaseGatePageContent.lib";
import type { ReleaseGateReplayModelMode } from "./releaseGateReplayConstants";
import { sanitizeReplayBodyOverrides } from "./releaseGateReplayMerge";

/** Fields required to build the POST body for `releaseGateAPI.validateAsync`. */
export type ReleaseGateValidateAsyncPayloadInput = {
  modelOverrideEnabled: boolean;
  newModel: string;
  replayProvider: ReplayProvider;
  failRateMax: number;
  flakyRateMax: number;
  agentId: string;
  runSnapshotIds: string[];
  runDatasetIds: string[];
  requestBody: Record<string, unknown>;
  requestSystemPrompt: string;
  toolsList: EditableTool[];
  requestBodyOverrides: Record<string, unknown>;
  requestBodyOverridesBySnapshotId: Record<string, Record<string, unknown>>;
  toolContextMode: "recorded" | "inject";
  toolContextScope: "global" | "per_snapshot";
  toolContextGlobalText: string;
  toolContextBySnapshotId: Record<string, string>;
  repeatRuns: number;
  /** When set, server uses this saved project API key for BYOK replay. */
  replayUserApiKeyId?: number | null;
  /** Explicit UI mode; when omitted, inferred from hosted allowlist + model id. */
  replayModelMode?: ReleaseGateReplayModelMode;
};

export type BuildReleaseGateValidateAsyncPayloadResult =
  | { ok: true; payload: ReleaseGateValidatePayload }
  | { ok: false; error: string };

/**
 * Pure construction of validate-async request body (mirrors Release Gate UI rules).
 */
export function buildReleaseGateValidateAsyncPayload(
  input: ReleaseGateValidateAsyncPayloadInput
): BuildReleaseGateValidateAsyncPayloadResult {
  const thresholds = normalizeGateThresholds(input.failRateMax, input.flakyRateMax);
  const payload: ReleaseGateValidatePayload = {
    agent_id: input.agentId.trim() || undefined,
    evaluation_mode: "replay_test",
    model_source: "detected",
    max_snapshots: 100,
    repeat_runs: input.repeatRuns,
    fail_rate_max: thresholds.failRateMax,
    flaky_rate_max: thresholds.flakyRateMax,
  };

  if (input.runSnapshotIds.length > 0) {
    payload.snapshot_ids = input.runSnapshotIds;
  } else if (input.runDatasetIds.length > 0) {
    payload.dataset_ids = input.runDatasetIds;
  }

  if (input.modelOverrideEnabled) {
    const trimmedModel = input.newModel.trim();
    payload.new_model = trimmedModel;
    payload.replay_provider = input.replayProvider;
    const inferredMode: ReleaseGateReplayModelMode =
      input.replayModelMode ??
      (isHostedPlatformModel(input.replayProvider, trimmedModel) ? "hosted" : "custom");
    if (inferredMode === "hosted") {
      if (!isHostedPlatformModel(input.replayProvider, trimmedModel)) {
        return {
          ok: false,
          error:
            "Hosted mode requires a hosted quick-pick model for the selected provider, or switch to Custom (BYOK).",
        };
      }
      payload.model_source = "platform";
    } else {
      payload.model_source = "detected";
      const kid = input.replayUserApiKeyId;
      if (kid != null && Number.isFinite(Number(kid))) {
        payload.replay_user_api_key_id = Number(kid);
      }
    }
  }

  payload.new_system_prompt =
    (typeof input.requestBody.system_prompt === "string"
      ? input.requestBody.system_prompt
      : input.requestSystemPrompt
    ).trim() || undefined;

  const temp = input.requestBody.temperature;
  const maxTok = input.requestBody.max_tokens;
  const topP = input.requestBody.top_p;
  if (temp != null && typeof temp === "number" && Number.isFinite(temp) && temp >= 0) {
    payload.replay_temperature = temp;
  }
  if (
    maxTok != null &&
    (typeof maxTok === "number" ? Number.isInteger(maxTok) : Number.isInteger(Number(maxTok))) &&
    Number(maxTok) > 0
  ) {
    payload.replay_max_tokens = Number(maxTok);
  }
  if (topP != null && typeof topP === "number" && Number.isFinite(topP)) {
    payload.replay_top_p = topP;
  }

  const overrides: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.requestBody)) {
    if (
      k === "model" ||
      k === "system_prompt" ||
      k === "messages" ||
      k === "temperature" ||
      k === "max_tokens" ||
      k === "top_p"
    ) {
      continue;
    }
    overrides[k] = v;
  }

  if (Array.isArray(input.requestBody.tools) && input.requestBody.tools.length > 0) {
    overrides.tools = input.requestBody.tools;
  } else if (input.toolsList.length > 0) {
    const built: Array<Record<string, unknown>> = [];
    for (const t of input.toolsList) {
      const name = t.name.trim();
      if (!name) continue;
      let params: Record<string, unknown> = {};
      if (t.parameters.trim()) {
        try {
          const p = JSON.parse(t.parameters.trim());
          if (p && typeof p === "object") params = p as Record<string, unknown>;
        } catch {
          return { ok: false, error: `Tool "${name}": parameters must be valid JSON.` };
        }
      }
      built.push({
        type: "function",
        function: {
          name,
          description: t.description.trim() || undefined,
          ...(Object.keys(params).length ? { parameters: params } : {}),
        },
      });
    }
    if (built.length) overrides.tools = built;
  }

  const bodyOverridesForRun = sanitizeReplayBodyOverrides(input.requestBodyOverrides);
  const mergedReplayOverrides = { ...overrides, ...bodyOverridesForRun };
  if (Object.keys(mergedReplayOverrides).length) payload.replay_overrides = mergedReplayOverrides;

  const perSidPayload: Record<string, Record<string, unknown>> = {};
  for (const sid of Object.keys(input.requestBodyOverridesBySnapshotId)) {
    const cleaned = sanitizeReplayBodyOverrides(input.requestBodyOverridesBySnapshotId[sid]);
    if (Object.keys(cleaned).length) perSidPayload[sid] = cleaned;
  }
  if (Object.keys(perSidPayload).length) {
    payload.replay_overrides_by_snapshot_id = perSidPayload;
  }

  payload.tool_context = buildToolContextPayload(
    input.toolContextMode,
    input.toolContextScope,
    input.toolContextGlobalText,
    input.toolContextBySnapshotId
  );

  return { ok: true, payload };
}
