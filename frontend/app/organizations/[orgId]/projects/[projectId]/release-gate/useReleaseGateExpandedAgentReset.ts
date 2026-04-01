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
  setExpandedHistoryId: (id: string | null) => void;
  clearHistoryOverlayPending: () => void;
  setSelectedRunId: (id: string | null) => void;
  setSelectedRunCaseIndex: (n: number | null) => void;
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
  setExpandedHistoryId,
  clearHistoryOverlayPending,
  setSelectedRunId,
  setSelectedRunCaseIndex,
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
    setExpandedHistoryId(null);
    clearHistoryOverlayPending();
    setSelectedRunId(null);
    setSelectedRunCaseIndex(null);
    setRepeatDropdownOpen(false);
  }, [
    agentId,
    clearHistoryOverlayPending,
    setDataPanelTab,
    setDetailAttemptView,
    setExpandedCaseIndex,
    setExpandedHistoryId,
    setTab,
    setRepeatDropdownOpen,
    setResultCaseFilter,
    setRightPanelTab,
    setSelectedRunId,
    setSelectedRunCaseIndex,
    setSettingsPanelOpen,
    tab,
  ]);
}
