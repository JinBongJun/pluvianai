import { REPLAY_PROVIDER_LABEL, normalizeReplayProvider, type ReplayProvider } from "./releaseGatePageContent.lib";

export function formatProviderLabel(provider: ReplayProvider): string {
  return REPLAY_PROVIDER_LABEL[provider];
}

export function toReplayProvider(value: unknown): ReplayProvider {
  return normalizeReplayProvider(value) ?? "openai";
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export function getToolParametersError(parameters: string): string {
  const trimmed = parameters.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Parameters must be a JSON object.";
    }
    return "";
  } catch {
    return "Parameters must be valid JSON.";
  }
}

/** Anthropic "pinned" model ids are versioned snapshots ending in YYYYMMDD. */
export function isPinnedAnthropicModelId(modelId: string): boolean {
  return /-\d{8}$/.test(String(modelId || "").trim());
}
