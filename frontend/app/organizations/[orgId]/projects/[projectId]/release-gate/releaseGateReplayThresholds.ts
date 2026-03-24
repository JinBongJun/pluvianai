import { REPLAY_THRESHOLD_PRESETS } from "./releaseGateReplayConstants";

export type GateThresholds = { failRateMax: number; flakyRateMax: number };

export function clampRate(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export function normalizeGateThresholds(failRateMax: unknown, flakyRateMax: unknown): GateThresholds {
  return {
    failRateMax: clampRate(failRateMax, REPLAY_THRESHOLD_PRESETS.default.failRateMax),
    flakyRateMax: clampRate(flakyRateMax, REPLAY_THRESHOLD_PRESETS.default.flakyRateMax),
  };
}
