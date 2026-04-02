"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";

import type { ReleaseGateResult } from "@/lib/api";
import type { CompletedReleaseGateResultEntry } from "./useReleaseGateValidateRun";

import {
  type ResultCaseFilter,
  type VisibleResultCase,
  buildWhatToFixHints,
  isCasePassing,
  summarizeRunToolGroundingFromCases,
} from "./releaseGateExpandedHelpers";
import type { ExpandedDetailAttemptView } from "./useReleaseGateExpandedHistoryOverlay";

export type UseReleaseGateExpandedResultPanelParams = {
  completedResults: CompletedReleaseGateResultEntry[];
  setDetailAttemptView: Dispatch<SetStateAction<ExpandedDetailAttemptView>>;
};

export type CompletedResultPanelCard = {
  reportId: string;
  result: ReleaseGateResult;
  completedAtMs: number;
  visibleResultCases: VisibleResultCase[];
  whatToFixHints: ReturnType<typeof buildWhatToFixHints>;
  toolGroundingRunSummary: ReturnType<typeof summarizeRunToolGroundingFromCases>;
};

export function useReleaseGateExpandedResultPanel({
  completedResults,
  setDetailAttemptView,
}: UseReleaseGateExpandedResultPanelParams) {
  const [resultCaseFilter, setResultCaseFilter] = useState<ResultCaseFilter>("all");

  const resultCards = useMemo<CompletedResultPanelCard[]>(
    () =>
      completedResults.map(entry => {
        const resultCases = Array.isArray(entry.result?.run_results)
          ? entry.result.run_results
          : Array.isArray(entry.result?.case_results)
            ? entry.result.case_results
            : [];

        return {
          reportId: entry.reportId,
          result: entry.result,
          completedAtMs: entry.completedAtMs,
          visibleResultCases: resultCases
            .map((run: any, caseIndex: number) => ({ run, caseIndex }))
            .filter(({ run }: VisibleResultCase) => {
              if (resultCaseFilter === "all") return true;
              if (resultCaseFilter === "failed") return !isCasePassing(run);
              return isCasePassing(run);
            }),
          whatToFixHints: buildWhatToFixHints(entry.result, resultCases),
          toolGroundingRunSummary: summarizeRunToolGroundingFromCases(resultCases),
        };
      }),
    [completedResults, resultCaseFilter]
  );

  useEffect(() => {
    setResultCaseFilter("all");
    setDetailAttemptView(null);
  }, [completedResults[0]?.reportId, setDetailAttemptView]);

  return {
    resultCaseFilter,
    setResultCaseFilter,
    resultCards,
  };
}
