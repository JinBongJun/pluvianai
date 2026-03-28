import {
  applyBodyOverridesToRequestBody,
  mergeReplayBodyOverridesForSnapshot,
} from "./releaseGateReplayMerge";
import type { ReleaseGateModelSource } from "./releaseGateReplayConstants";
import {
  applySystemPromptToBody,
  asPayloadObject,
  getRequestPart,
} from "./releaseGatePayloadParts";

export function buildFinalCandidateRequest(options: {
  baselineSeedSnapshot: Record<string, unknown> | null;
  baselinePayload: Record<string, unknown> | null;
  nodeBasePayload: Record<string, unknown> | null;
  requestBody: Record<string, unknown>;
  requestSystemPrompt: string;
  modelSource: ReleaseGateModelSource;
  newModel: string;
  /** Merged after requestBody; wins on conflict. Does not replace messages/user text (sanitized). */
  requestBodyOverrides?: Record<string, unknown> | null;
  /** Per selected snapshot ids; merged after global for the seed snapshot preview. */
  requestBodyOverridesBySnapshotId?: Record<string, Record<string, unknown>> | null;
  /** First baseline snapshot id (for merged body-overrides preview). */
  seedSnapshotId?: string | null;
}): Record<string, unknown> {
  const {
    baselineSeedSnapshot,
    baselinePayload,
    nodeBasePayload,
    requestBody,
    requestSystemPrompt,
    modelSource,
    newModel,
    requestBodyOverrides,
    requestBodyOverridesBySnapshotId,
    seedSnapshotId,
  } = options;

  const baseFromSnapshot = asPayloadObject(baselineSeedSnapshot?.payload);
  const baseRequest = baseFromSnapshot
    ? getRequestPart(baseFromSnapshot)
    : baselinePayload || nodeBasePayload || {};

  let finalReq: Record<string, unknown> = JSON.parse(JSON.stringify(baseRequest || {}));

  if (modelSource !== "detected" && newModel.trim()) {
    finalReq.model = newModel.trim();
  }

  const trimmedPrompt = requestSystemPrompt.trim();
  if (trimmedPrompt) {
    finalReq = applySystemPromptToBody(finalReq, trimmedPrompt);
  }

  if (typeof requestBody.temperature === "number") {
    finalReq.temperature = requestBody.temperature;
  }
  if (typeof requestBody.max_tokens === "number") {
    finalReq.max_tokens = requestBody.max_tokens;
  }
  if (typeof requestBody.top_p === "number") {
    finalReq.top_p = requestBody.top_p;
  }

  for (const [k, v] of Object.entries(requestBody)) {
    if (
      k === "model" ||
      k === "system_prompt" ||
      k === "messages" ||
      k === "message" ||
      k === "user_message" ||
      k === "response" ||
      k === "responses" ||
      k === "input" ||
      k === "inputs" ||
      k === "trace_id" ||
      k === "agent_id" ||
      k === "agent_name"
    ) {
      continue;
    }
    finalReq[k] = v;
  }

  const mergedSup = mergeReplayBodyOverridesForSnapshot(
    requestBodyOverrides ?? undefined,
    requestBodyOverridesBySnapshotId ?? undefined,
    seedSnapshotId ?? null
  );
  if (Object.keys(mergedSup).length > 0) {
    finalReq = applyBodyOverridesToRequestBody(finalReq, mergedSup);
  }

  return finalReq;
}
