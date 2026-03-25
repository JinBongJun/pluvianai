"use client";

import { useMemo } from "react";

import { buildReleaseGatePageContextParams } from "./releaseGatePageContextParams";
import type { ReleaseGatePageContextRestSlice } from "./releaseGatePageContextParams";
import type { ReleaseGatePageLocalStateBundle } from "./useReleaseGatePageLocalState";
import type { ReleaseGateRunDataDerivationsBundle } from "./useReleaseGateRunDataDerivations";
import type { UseReleaseGatePageContextValueParams } from "./useReleaseGatePageContextValue";

/**
 * Stable flat params for `useReleaseGatePageContextValue`.
 * Pass memoized `rest` from the page model so `[lv, rd, rest]` only changes when inputs do.
 */
export function useReleaseGatePageContextParams(
  lv: ReleaseGatePageLocalStateBundle,
  rd: ReleaseGateRunDataDerivationsBundle,
  rest: ReleaseGatePageContextRestSlice
): UseReleaseGatePageContextValueParams {
  return useMemo(() => buildReleaseGatePageContextParams(lv, rd, rest), [lv, rd, rest]);
}
