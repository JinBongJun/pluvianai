"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";

import type { ResultCaseFilter } from "./releaseGateExpandedHelpers";
import type { ExpandedDetailAttemptView } from "./useReleaseGateExpandedHistoryOverlay";

export type UseReleaseGateExpandedAgentResetParams = {
  agentId: string;
  setDataPanelTab: (t: "logs" | "datasets") => void;
  setRightPanelTab: (t: "results" | "history") => void;
  setResultCaseFilter: (f: ResultCaseFilter) => void;
  setSettingsPanelOpen: (b: boolean) => void;
  setDetailAttemptView: Dispatch<SetStateAction<ExpandedDetailAttemptView>>;
  setExpandedCaseIndex: (n: number | null) => void;
  clearHistoryOverlayPending: () => void;
  setSelectedRunId: (id: string | null) => void;
  setRepeatDropdownOpen: (b: boolean) => void;
};

export function useReleaseGateExpandedAgentReset({
  agentId,
  setDataPanelTab,
  setRightPanelTab,
  setResultCaseFilter,
  setSettingsPanelOpen,
  setDetailAttemptView,
  setExpandedCaseIndex,
  clearHistoryOverlayPending,
  setSelectedRunId,
  setRepeatDropdownOpen,
}: UseReleaseGateExpandedAgentResetParams): void {
  useEffect(() => {
    setDataPanelTab("logs");
    setRightPanelTab("results");
    setResultCaseFilter("all");
    setSettingsPanelOpen(false);
    setDetailAttemptView(null);
    setExpandedCaseIndex(null);
    clearHistoryOverlayPending();
    setSelectedRunId(null);
    setRepeatDropdownOpen(false);
  }, [
    agentId,
    clearHistoryOverlayPending,
    setDataPanelTab,
    setDetailAttemptView,
    setExpandedCaseIndex,
    setRepeatDropdownOpen,
    setResultCaseFilter,
    setRightPanelTab,
    setSelectedRunId,
    setSettingsPanelOpen,
  ]);
}
