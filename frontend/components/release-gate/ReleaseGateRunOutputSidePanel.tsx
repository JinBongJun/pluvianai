"use client";
import type { Dispatch, SetStateAction } from "react";
import clsx from "clsx";
import { Activity, Flag, RefreshCcw } from "lucide-react";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import {
  HistoryRunRowButton,
  ResultCaseRowButton,
} from "@/components/release-gate/ReleaseGateRowButtons";
import type { ReleaseGateHistoryItem } from "@/lib/api/types";
import {
  formatDateTime,
  groupHistoryItemsBySession,
  type ResultCaseFilter,
  type VisibleResultCase,
  type FixHint,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";
import {
  formatDurationMs,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateViewUtils";

export type ToolGroundingRunSummary = {
  withTools: number;
  pass: number;
  fail: number;
  semanticOk: number;
  semanticOff: number;
};

export type ReleaseGateRunOutputSidePanelProps = {
  onClose: () => void;
  rightPanelTab: "results" | "history";
  setRightPanelTab: Dispatch<SetStateAction<"results" | "history">>;
  result: any;
  dismissedReportId: string | null;
  onDismissLatest: () => void;
  showingPersistedResultWhileRunning: boolean;
  repeatRuns: number;
  toolGroundingRunSummary: ToolGroundingRunSummary | null;
  whatToFixHints: FixHint[];
  resultCaseFilter: ResultCaseFilter;
  setResultCaseFilter: Dispatch<SetStateAction<ResultCaseFilter>>;
  visibleResultCases: VisibleResultCase[];
  baselineSnapshotsById: Map<string, Record<string, unknown>>;
  recentSnapshots: any[];
  setDetailAttemptView: Dispatch<
    SetStateAction<{
      attempts: any[];
      caseIndex: number;
      initialAttemptIndex: number;
      baselineSnapshot: Record<string, unknown> | null;
    } | null>
  >;
  historyLoading: boolean;
  nodeHistoryItems: ReleaseGateHistoryItem[];
  historyTotal: number;
  historyFilterSummary: string[];
  historyStatus: "all" | "pass" | "fail";
  setHistoryStatus: (s: "all" | "pass" | "fail") => void;
  setHistoryOffset: Dispatch<SetStateAction<number>>;
  historyDatePreset: "all" | "24h" | "7d" | "30d";
  setHistoryDatePreset: (p: "all" | "24h" | "7d" | "30d") => void;
  historyRefreshing: boolean;
  mutateHistory: () => void;
  /** Shared with main History tab; used only to detect “default” filters for empty copy. */
  historyTraceId: string;
  expandedHistoryId: string | null;
  selectedRunReportLoading: boolean;
  selectHistoryRun: (item: ReleaseGateHistoryItem) => void;
};

export function ReleaseGateRunOutputSidePanel(props: ReleaseGateRunOutputSidePanelProps) {
  const {
    onClose,
    rightPanelTab,
    setRightPanelTab,
    result,
    dismissedReportId,
    onDismissLatest,
    showingPersistedResultWhileRunning,
    repeatRuns,
    toolGroundingRunSummary,
    resultCaseFilter,
    setResultCaseFilter,
    visibleResultCases,
    baselineSnapshotsById,
    recentSnapshots,
    setDetailAttemptView,
    historyLoading,
    nodeHistoryItems,
    historyTotal,
    historyFilterSummary,
    historyStatus,
    setHistoryStatus,
    setHistoryOffset,
    historyDatePreset,
    setHistoryDatePreset,
    historyRefreshing,
    mutateHistory,
    historyTraceId,
    expandedHistoryId,
    selectedRunReportLoading,
    selectHistoryRun,
  } = props;

  const historyFiltersAreDefault =
    historyStatus === "all" && historyDatePreset === "all" && !historyTraceId.trim();
  const groupedHistoryItems = groupHistoryItemsBySession(nodeHistoryItems);
  const currentReportId = result?.report_id ? String(result.report_id) : null;
  const resultVisible = Boolean(result) && currentReportId !== dismissedReportId;

  return (
    <RailwaySidePanel
      title="Run output"
      headerEyebrow="After each run"
      footerStatusLabel="Validation session active"
      isOpen={true}
      onClose={onClose}
      side="right"
      width={320}
      showCloseButton={true}
      className="pointer-events-auto"
      tabs={[
        { id: "results", label: "Results" },
        { id: "history", label: "History" },
      ]}
      tabTestIdPrefix="rg-right-tab"
      activeTab={rightPanelTab}
      onTabChange={id => {
        const next = id as "results" | "history";
        setRightPanelTab(next);
      }}
    >
      <div className="flex h-full flex-col overflow-y-auto custom-scrollbar">
        {rightPanelTab === "results" && (
          <div className="flex-1 space-y-4 p-4">
            <div
              className="flex w-full gap-0.5 rounded-xl border border-white/8 bg-black/20 p-1"
              role="group"
              aria-label="Filter result rows"
            >
              {(
                [
                  { id: "all" as const, label: "All" },
                  { id: "failed" as const, label: "Needs review" },
                  { id: "passed" as const, label: "Healthy" },
                ] as const
              ).map(option => (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`rg-result-case-filter-${option.id}`}
                  onClick={() => setResultCaseFilter(option.id)}
                  className={clsx(
                    "min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px] sm:px-2",
                    resultCaseFilter === option.id
                      ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                      : "text-white/40 hover:bg-white/[0.05] hover:text-white/80"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {!resultVisible ? (
              <div className="flex flex-col items-center justify-center py-14 text-center opacity-70">
                <Activity className="mb-4 h-8 w-8 text-white/40" />
                <div className="text-sm font-semibold text-white/60">
                  {!result ? "Awaiting run" : "Latest result hidden"}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                  {!result
                    ? "Select logs or datasets in the left panel, adjust options on the agent card, then press Start. Gate status and per-input rows show up here."
                    : "Open History to inspect the completed run, or run again to generate a new result."}
                </p>
              </div>
            ) : (
              <>
                {showingPersistedResultWhileRunning ? (
                  <div
                    data-testid="rg-persisted-result-running-note"
                    className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-[11px] leading-relaxed text-indigo-100"
                  >
                    Showing the previous completed result while this run is still in progress.
                  </div>
                ) : null}
                {/* Compact Global Status Banner */}
                <div
                  className={clsx(
                    "flex flex-col gap-2 rounded-2xl border px-4 py-3",
                    result.pass
                      ? "border-l-2 border-emerald-500/50 bg-emerald-500/5 text-emerald-100"
                      : "border-l-2 border-rose-500/50 bg-rose-500/5 text-rose-100"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                    <span>Inputs: {Number(result.total_inputs ?? 0)}</span>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span>Repeats: {Number(result.repeat_runs ?? repeatRuns)}</span>
                    {result?.perf && typeof result.perf === "object" && (
                      <>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>
                          Avg: {formatDurationMs((result.perf as any).avg_attempt_wall_ms)}
                        </span>
                      </>
                    )}
                  </div>
                  {toolGroundingRunSummary ? (
                    <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2">
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                        Tool grounding
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/60">
                        <span>
                          With tools:{" "}
                          <span className="font-semibold text-white/90">
                            {toolGroundingRunSummary.withTools}
                          </span>
                        </span>
                        <span className="text-emerald-400/90">
                          Healthy {toolGroundingRunSummary.pass}
                        </span>
                        <span className="text-rose-400/90">
                          Flagged {toolGroundingRunSummary.fail}
                        </span>
                        {toolGroundingRunSummary.semanticOk > 0 ? (
                          <span className="text-violet-300/90">
                            Semantic OK {toolGroundingRunSummary.semanticOk}
                          </span>
                        ) : null}
                        {toolGroundingRunSummary.semanticOff > 0 ? (
                          <span
                            className="text-white/30"
                            title="Semantic judge did not run (e.g. no OpenAI key)."
                          >
                            Semantic judge off {toolGroundingRunSummary.semanticOff}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  {visibleResultCases.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-white/30">
                      {resultCaseFilter === "failed"
                        ? "No failed or flaky inputs in this run."
                        : resultCaseFilter === "passed"
                          ? "No healthy inputs in this run."
                          : "No per-input result rows returned for this run."}
                    </div>
                  ) : (
                    visibleResultCases.map(({ run, caseIndex: idx }: VisibleResultCase) => {
                      const baselineSnapshotForRun =
                        (baselineSnapshotsById.get(String(run?.snapshot_id ?? "")) as
                          | Record<string, unknown>
                          | undefined) ??
                        (recentSnapshots.find(
                          s =>
                            String((s as Record<string, unknown>)?.id ?? "") ===
                            String(run?.snapshot_id ?? "")
                        ) as Record<string, unknown> | undefined) ??
                        null;

                      return (
                        <ResultCaseRowButton
                          key={idx}
                          run={run}
                          idx={idx}
                          repeatRunsFallback={result.repeat_runs ?? repeatRuns}
                          baselineSnapshotForRun={baselineSnapshotForRun}
                          onDismissLatest={currentReportId ? onDismissLatest : undefined}
                          onSelect={({ attempts, caseIndex, baselineSnapshot }) =>
                            setDetailAttemptView({
                              attempts,
                              caseIndex,
                              initialAttemptIndex: 0,
                              baselineSnapshot,
                            })
                          }
                          testId={`rg-result-case-${idx}`}
                        />
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {rightPanelTab === "history" && (
          <div className="flex-1 space-y-4 p-4">
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className="h-16 rounded-2xl border border-white/5 bg-white/5 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-emerald-400/90 uppercase tracking-widest mb-1.5">
                      Validation history
                    </div>
                    <div className="text-sm font-semibold text-white">
                      Inputs from recent validation sessions
                    </div>
                    <div className="mt-1.5 text-xs leading-relaxed text-white/40">
                      Scoped to this agent: one row per input from recent runs, grouped by validation
                      session. Use input preview and trace to tell rows apart.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-white/40 items-center">
                      <span className="font-medium text-white/60">
                        {historyTotal} inputs
                      </span>
                      {historyFilterSummary.map(part => (
                        <span
                          key={part}
                          className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-white/50"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2">
                    <div className="bg-[#030806] border border-white/[0.04] rounded-xl hover:border-white/10 transition-colors focus-within:border-emerald-500/50 min-w-[5.5rem]">
                      <label className="sr-only" htmlFor="rg-run-output-history-status">
                        Filter runs by health
                      </label>
                      <select
                        id="rg-run-output-history-status"
                        value={historyStatus}
                        onChange={e => {
                          setHistoryStatus(e.target.value as "all" | "pass" | "fail");
                          setHistoryOffset(0);
                        }}
                        className="w-full cursor-pointer bg-transparent py-2 pl-3 pr-2 text-[11px] font-bold tracking-[0.08em] text-white/80 outline-none"
                      >
                        <option value="all" className="bg-[#18191e] text-white/80">
                          All
                        </option>
                        <option value="pass" className="bg-[#18191e] text-white/80">
                          Healthy
                        </option>
                        <option value="fail" className="bg-[#18191e] text-white/80">
                          Flagged
                        </option>
                      </select>
                    </div>
                    <div className="bg-[#030806] border border-white/[0.04] rounded-xl hover:border-white/10 transition-colors focus-within:border-emerald-500/50 min-w-[7rem]">
                      <label className="sr-only" htmlFor="rg-run-output-history-dates">
                        Filter runs by date range
                      </label>
                      <select
                        id="rg-run-output-history-dates"
                        value={historyDatePreset}
                        onChange={e => {
                          setHistoryDatePreset(e.target.value as "all" | "24h" | "7d" | "30d");
                          setHistoryOffset(0);
                        }}
                        className="w-full cursor-pointer bg-transparent py-2 pl-3 pr-2 text-[11px] font-bold tracking-[0.08em] text-white/80 outline-none"
                      >
                        <option value="all" className="bg-[#18191e] text-white/80">
                          All dates
                        </option>
                        <option value="24h" className="bg-[#18191e] text-white/80">
                          Last 24h
                        </option>
                        <option value="7d" className="bg-[#18191e] text-white/80">
                          Last 7d
                        </option>
                        <option value="30d" className="bg-[#18191e] text-white/80">
                          Last 30d
                        </option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => mutateHistory()}
                      disabled={historyRefreshing}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold text-white/80 hover:bg-white/5 disabled:opacity-60"
                    >
                      <RefreshCcw
                        className={clsx("h-3.5 w-3.5", historyRefreshing && "animate-spin")}
                      />
                      {historyRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>
                </div>
                {nodeHistoryItems.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                    <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
                    <p className="text-sm text-white/30">
                      {historyFiltersAreDefault
                        ? "No retained inputs yet for this agent."
                        : "No retained inputs match these filters. Try All or widen the date range."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupedHistoryItems.map(group => (
                      <div key={group.id} className="space-y-2">
                        <div className="px-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                          {formatDateTime(group.createdAt)} · {group.totalInputs} inputs
                          {group.repeatRuns ? ` · ${group.repeatRuns}x each` : ""}
                        </div>
                        {group.items.map(item => (
                          <HistoryRunRowButton
                            key={item.id}
                            item={item}
                            selected={expandedHistoryId === item.id}
                            loading={selectedRunReportLoading && expandedHistoryId === item.id}
                            onClick={() => selectHistoryRun(item)}
                            testId={`rg-node-history-row-${item.id}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </RailwaySidePanel>
  );
}
