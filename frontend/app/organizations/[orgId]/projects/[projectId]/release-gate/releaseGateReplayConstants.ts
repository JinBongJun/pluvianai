export type ReplayProvider = "openai" | "anthropic" | "google";

/** Hosted (platform credits) vs Custom (BYOK / detected) when model override is on. */
export type ReleaseGateReplayModelMode = "hosted" | "custom";

export const RECENT_SNAPSHOT_LIMIT = 100;
export const BASELINE_SNAPSHOT_LIMIT = 200;
/** Stable fallback for SWR `data?.items` — inline `[]` is a new reference each render and breaks useMemo/useEffect dependencies. */
export const EMPTY_SWF_ITEMS: never[] = [];
export const REPLAY_PROVIDER_LABEL: Record<ReplayProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};
/** Hosted (platform) quick picks — must match backend `CORE_REPLAY_MODELS`. Premium models: Custom model ID + BYOK. */
export const DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY: Record<ReplayProvider, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4.1-mini"],
  anthropic: ["claude-haiku-4-5-20251001"],
  google: ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
};

/** True when this model id is allowed for `model_source: platform` (hosted credits). */
export function isHostedPlatformModel(provider: ReplayProvider, modelId: string): boolean {
  const mid = (modelId || "").trim();
  if (!mid) return false;
  const list = DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY[provider] || [];
  return list.includes(mid);
}
export const REPLAY_THRESHOLD_PRESETS = {
  strict: {
    label: "Strict",
    failRateMax: 0.05,
    flakyRateMax: 0.01,
  },
  default: {
    label: "Normal",
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
  lenient: {
    label: "Lenient",
    failRateMax: 0.1,
    flakyRateMax: 0.05,
  },
  custom: {
    label: "Custom",
    failRateMax: 0.05,
    flakyRateMax: 0.03,
  },
} as const;

export type ThresholdPreset = keyof typeof REPLAY_THRESHOLD_PRESETS;

/** Provider-level default knobs for replay when no snapshot payload exists or has no config. */
export const PROVIDER_PAYLOAD_TEMPLATES: Record<ReplayProvider, Record<string, unknown>> = {
  openai: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 512,
  },
  anthropic: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 1024,
  },
  google: {
    temperature: 0.3,
    top_p: 1,
    max_tokens: 512,
  },
};
