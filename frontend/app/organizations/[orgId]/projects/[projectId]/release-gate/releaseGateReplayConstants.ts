export type ReplayProvider = "openai" | "anthropic" | "google";

export const RECENT_SNAPSHOT_LIMIT = 100;
export const BASELINE_SNAPSHOT_LIMIT = 200;
/** Stable fallback for SWR `data?.items` — inline `[]` is a new reference each render and breaks useMemo/useEffect dependencies. */
export const EMPTY_SWF_ITEMS: never[] = [];
export const REPLAY_PROVIDER_LABEL: Record<ReplayProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
};
export const DEFAULT_REPLAY_PROVIDER_MODEL_LIBRARY: Record<ReplayProvider, string[]> = {
  openai: [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1",
    "gpt-4.1-mini",
  ],
  anthropic: [
    // Keep conservative, pinned IDs for reproducible Release Gate runs.
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-20250514",
  ],
  google: [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ],
};
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
