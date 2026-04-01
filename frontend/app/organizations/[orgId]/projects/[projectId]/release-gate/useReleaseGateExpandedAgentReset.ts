"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";

import type { ResultCaseFilter } from "./releaseGateExpandedHelpers";
import type { GateTab } from "./releaseGateExpandedHelpers";
import type { ExpandedDetailAttemptView } from "./useReleaseGateExpandedHistoryOverlay";
import { shouldResetReleaseGateMainTab } from "./releaseGateMainViewState";

export type UseReleaseGateExpandedAgentResetParams = {
  agentId: string;
  tab: GateTab;
  setTab: (t: GateTab) => void;
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
  tab,
  setTab,
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
  const previousAgentIdRef = useRef(agentId);

  useEffect(() => {
    if (shouldResetReleaseGateMainTab(previousAgentIdRef.current, agentId) && tab !== "validate") {
      setTab("validate");
    }
    previousAgentIdRef.current = agentId;
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
    setTab,
    setRepeatDropdownOpen,
    setResultCaseFilter,
    setRightPanelTab,
    setSelectedRunId,
    setSettingsPanelOpen,
    tab,
  ]);
}
