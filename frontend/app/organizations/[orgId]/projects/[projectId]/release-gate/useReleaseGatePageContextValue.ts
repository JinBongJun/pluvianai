"use client";

import { useMemo } from "react";

import type { ReleaseGatePageContextValue } from "./releaseGatePageContext.types";
import {
  applySystemPromptToBody,
  normalizeGateThresholds,
  REPLAY_THRESHOLD_PRESETS,
  snapshotEvalFailed,
} from "./releaseGatePageContent.lib";

export const RELEASE_GATE_REPEAT_OPTIONS = [1, 10, 50, 100] as const;

export type UseReleaseGatePageContextValueParams = Omit<
  ReleaseGatePageContextValue,
  | "REPLAY_THRESHOLD_PRESETS"
  | "REPEAT_OPTIONS"
  | "snapshotEvalFailed"
  | "normalizeGateThresholds"
  | "applySystemPromptToBody"
>;

export function useReleaseGatePageContextValue(
  p: UseReleaseGatePageContextValueParams
): ReleaseGatePageContextValue {
  return useMemo(
    () => ({
      ...p,
      REPLAY_THRESHOLD_PRESETS,
      REPEAT_OPTIONS: RELEASE_GATE_REPEAT_OPTIONS,
      snapshotEvalFailed,
      normalizeGateThresholds,
      applySystemPromptToBody,
    }),
    // `p` must come from `useReleaseGatePageContextParams` (memoized); do not pass a fresh object literal each render.
    [p]
  );
}
