"use client";

import { useRef } from "react";

import {
  createDefaultValidateRunDeps,
  useReleaseGateValidateRun,
} from "./useReleaseGateValidateRun";

/**
 * Owns validate-run deps ref + history mutate ref wiring for {@link useReleaseGateValidateRun}.
 */
export function useReleaseGateValidateBridge(projectId: number, agentId: string) {
  const mutateHistoryRef = useRef<(() => unknown) | undefined>(undefined);
  const validateRunDepsRef = useRef(createDefaultValidateRunDeps());

  const {
    isValidating,
    runLocked,
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
    dismissedReportId,
    dismissLatestResult,
    showingPersistedResultWhileRunning,
  } = useReleaseGateValidateRun({
    projectId,
    agentId,
    depsRef: validateRunDepsRef,
    mutateHistoryRef,
  });

  return {
    mutateHistoryRef,
    validateRunDepsRef,
    isValidating,
    runLocked,
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
    dismissedReportId,
    dismissLatestResult,
    showingPersistedResultWhileRunning,
  };
}
