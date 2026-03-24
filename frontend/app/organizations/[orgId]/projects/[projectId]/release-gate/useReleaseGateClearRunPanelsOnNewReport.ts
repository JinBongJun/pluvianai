"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

export function useReleaseGateClearRunPanelsOnNewReport(
  reportId: string | undefined,
  setSelectedRunResultIndex: Dispatch<SetStateAction<number | null>>,
  setExpandedCaseIndex: Dispatch<SetStateAction<number | null>>,
  setSelectedAttempt: Dispatch<
    SetStateAction<{ caseIndex: number; attemptIndex: number } | null>
  >
): void {
  useEffect(() => {
    setSelectedRunResultIndex(null);
    setExpandedCaseIndex(null);
    setSelectedAttempt(null);
  }, [
    reportId,
    setSelectedRunResultIndex,
    setExpandedCaseIndex,
    setSelectedAttempt,
  ]);
}
