import { REPLAY_PROVIDER_LABEL, type ReplayProvider } from "./releaseGateReplayConstants";

export function normalizeReplayProvider(raw: unknown): ReplayProvider | null {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "openai" || value === "anthropic" || value === "google") return value;
  return null;
}

export function inferProviderFromModelId(modelId: unknown): ReplayProvider | null {
  const model = String(modelId ?? "")
    .trim()
    .toLowerCase();
  if (!model) return null;
  if (
    model.startsWith("gpt") ||
    model.startsWith("o1") ||
    model.startsWith("o3") ||
    model.startsWith("o4") ||
    model.startsWith("text-embedding") ||
    model.startsWith("openai/")
  ) {
    return "openai";
  }
  if (model.includes("claude") || model.startsWith("anthropic/")) return "anthropic";
  if (
    model.includes("gemini") ||
    model.includes("google") ||
    model.startsWith("models/gemini") ||
    model.startsWith("google/")
  ) {
    return "google";
  }
  return null;
}

export function validateCustomModelForProvider(
  provider: ReplayProvider,
  modelId: string
): { ok: true } | { ok: false; message: string } {
  const trimmed = String(modelId ?? "").trim();
  if (!trimmed) return { ok: false, message: "Model id is required." };
  const inferred = inferProviderFromModelId(trimmed);
  if (inferred && inferred !== provider) {
    return {
      ok: false,
      message: `Run blocked: model "${trimmed}" looks like ${REPLAY_PROVIDER_LABEL[inferred]}, but provider is set to ${REPLAY_PROVIDER_LABEL[provider]}.`,
    };
  }
  return { ok: true };
}

export function describeMissingProviderKeys(missingProviders: ReplayProvider[]): string {
  if (missingProviders.length === 0) return "";
  const labels = missingProviders.map(p => REPLAY_PROVIDER_LABEL[p]).join(", ");
  return `Run blocked: ${labels} API key is not registered for the selected agent (or project default). Open Live View, click the agent, then register the key in the Settings tab.`;
}
