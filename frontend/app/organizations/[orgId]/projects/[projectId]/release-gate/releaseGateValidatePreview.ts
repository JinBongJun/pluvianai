import { sanitizeReplayBodyOverrides } from "./releaseGateReplayMerge";
import type { EditableTool } from "./releaseGateEditableTools";
import { buildOpenAIStyleToolsFromEditableTools } from "./releaseGateEditableTools";
import { inferProviderFromModelId } from "./releaseGateProviderModel";
import type { ReplayProvider } from "./releaseGateReplayConstants";
import { buildToolContextPayload } from "./releaseGateToolContext";

export type BuildValidateOverridePreviewInput = {
  modelOverrideEnabled: boolean;
  newModel: string;
  replayProvider: ReplayProvider;
  requestBody: Record<string, unknown>;
  requestSystemPrompt: string;
  toolsList: EditableTool[];
  toolContextMode: "recorded" | "inject";
  toolContextScope: "global" | "per_snapshot";
  toolContextGlobalText: string;
  toolContextBySnapshotId: Record<string, string>;
  requestBodyOverrides: Record<string, unknown>;
  selectedSnapshotIdsForRun: string[];
  requestBodyOverridesBySnapshotId: Record<string, Record<string, unknown>>;
};

/**
 * UI preview for what Release Gate validate will override and send.
 * Intentionally excludes snapshot conversation ("messages") so the preview
 * stays clean and doesn't duplicate system prompt content.
 */
export function buildValidateOverridePreview(
  input: BuildValidateOverridePreviewInput
): Record<string, unknown> {
  const {
    modelOverrideEnabled,
    newModel,
    replayProvider,
    requestBody,
    requestSystemPrompt,
    toolsList,
    toolContextMode,
    toolContextScope,
    toolContextGlobalText,
    toolContextBySnapshotId,
    requestBodyOverrides,
    selectedSnapshotIdsForRun,
    requestBodyOverridesBySnapshotId,
  } = input;

  const preview: Record<string, unknown> = {
    model_source: modelOverrideEnabled ? "platform" : "detected",
  };

  if (modelOverrideEnabled) {
    const trimmedModel = newModel.trim();
    if (trimmedModel) {
      const inferredProvider = inferProviderFromModelId(trimmedModel);
      const effectiveProvider = inferredProvider || replayProvider;
      preview.new_model = trimmedModel;
      preview.replay_provider = effectiveProvider;
    }
  }

  const sys =
    (typeof requestBody.system_prompt === "string"
      ? requestBody.system_prompt
      : requestSystemPrompt
    ).trim() || undefined;
  if (sys) preview.new_system_prompt = sys;

  const temp = requestBody.temperature;
  if (temp != null && typeof temp === "number" && Number.isFinite(temp) && temp >= 0) {
    preview.replay_temperature = temp;
  }

  const maxTok = requestBody.max_tokens;
  if (
    maxTok != null &&
    (typeof maxTok === "number"
      ? Number.isInteger(maxTok)
      : Number.isInteger(Number(maxTok))) &&
    Number(maxTok) > 0
  ) {
    preview.replay_max_tokens = Number(maxTok);
  }

  const topP = requestBody.top_p;
  if (topP != null && typeof topP === "number" && Number.isFinite(topP)) {
    preview.replay_top_p = topP;
  }

  const overrides: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(requestBody)) {
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

  if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
    overrides.tools = requestBody.tools;
  } else if (toolsList.length > 0) {
    const built = buildOpenAIStyleToolsFromEditableTools(toolsList);
    if (built.length) overrides.tools = built;
  }

  const bodyOverridesPreview = sanitizeReplayBodyOverrides(requestBodyOverrides);
  const mergedOverrides = { ...overrides, ...bodyOverridesPreview };
  if (Object.keys(mergedOverrides).length) {
    preview.replay_overrides = mergedOverrides;
  }

  const perBySnap: Record<string, Record<string, unknown>> = {};
  for (const sid of selectedSnapshotIdsForRun) {
    const s = sanitizeReplayBodyOverrides(requestBodyOverridesBySnapshotId[sid]);
    if (Object.keys(s).length) perBySnap[sid] = s;
  }
  if (Object.keys(perBySnap).length) {
    preview.replay_overrides_by_snapshot_id = perBySnap;
  }

  preview.tool_context = buildToolContextPayload(
    toolContextMode,
    toolContextScope,
    toolContextGlobalText,
    toolContextBySnapshotId
  );

  return preview;
}
