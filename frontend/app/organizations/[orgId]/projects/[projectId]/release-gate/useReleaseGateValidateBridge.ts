"use client";

import { useRef } from "react";

import {
  createDefaultValidateRunDeps,
  useReleaseGateValidateRun,
} from "./useReleaseGateValidateRun";

/**
 * Owns validate-run deps ref + history mutate ref wiring for {@link useReleaseGateValidateRun}.
 */
export function useReleaseGateValidateBridge(projectId: number) {
  const mutateHistoryRef = useRef<(() => unknown) | undefined>(undefined);
  const validateRunDepsRef = useRef(createDefaultValidateRunDeps());

  const {
    isValidating,
    activeJobId,
    cancelRequested,
    cancelLocked,
    result,
    error,
    planError,
    runValidateCooldownUntilMs,
    handleValidate,
    handleCancelActiveJob,
    clearRunUi,
  } = useReleaseGateValidateRun({
    projectId,
    depsRef: validateRunDepsRef,
    mutateHistoryRef,
  });

  return {
    mutateHistoryRef,
    validateRunDepsRef,
    isValidating,
    activeJobId,
    cancelRequested,
    cancelLocked,
    result,
    error,
    planError,
    runValidateCooldownUntilMs,
    handleValidate,
    handleCancelActiveJob,
    clearRunUi,
  };
}
