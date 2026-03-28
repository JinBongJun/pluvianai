"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ReleaseGateResult } from "@/lib/api";

import {
  type ResultCaseFilter,
  type VisibleResultCase,
  buildWhatToFixHints,
  isCasePassing,
  summarizeRunToolGroundingFromCases,
} from "./releaseGateExpandedHelpers";
import type { ExpandedDetailAttemptView } from "./useReleaseGateExpandedHistoryOverlay";

export type UseReleaseGateExpandedResultPanelParams = {
  result: ReleaseGateResult | null;
  setDetailAttemptView: Dispatch<SetStateAction<ExpandedDetailAttemptView>>;
};

export function useReleaseGateExpandedResultPanel({
  result,
  setDetailAttemptView,
}: UseReleaseGateExpandedResultPanelParams) {
  const [resultCaseFilter, setResultCaseFilter] = useState<ResultCaseFilter>("all");

  const resultCases = useMemo(() => {
    if (Array.isArray(result?.run_results)) return result.run_results;
    if (Array.isArray(result?.case_results)) return result.case_results;
    return [];
  }, [result]);

  const visibleResultCases = useMemo(
    () =>
      resultCases
        .map((run: any, caseIndex: number) => ({ run, caseIndex }))
        .filter(({ run }: VisibleResultCase) => {
          if (resultCaseFilter === "all") return true;
          if (resultCaseFilter === "failed") return !isCasePassing(run);
          return isCasePassing(run);
        }),
    [resultCases, resultCaseFilter]
  );

  const whatToFixHints = useMemo(() => buildWhatToFixHints(result, resultCases), [result, resultCases]);

  const toolGroundingRunSummary = useMemo(
    () => summarizeRunToolGroundingFromCases(resultCases),
    [resultCases]
  );

  useEffect(() => {
    setResultCaseFilter("all");
    setDetailAttemptView(null);
  }, [result?.report_id, setDetailAttemptView]);

  return {
    resultCaseFilter,
    setResultCaseFilter,
    visibleResultCases,
    whatToFixHints,
    toolGroundingRunSummary,
  };
}
