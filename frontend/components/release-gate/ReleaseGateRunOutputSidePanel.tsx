"use client";

import type { Dispatch, SetStateAction } from "react";
import clsx from "clsx";
import { Activity, Flag, RefreshCcw } from "lucide-react";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import {
  HistoryRunRowButton,
  ResultCaseRowButton,
} from "@/components/release-gate/ReleaseGateRowButtons";
import {
  type ResultCaseFilter,
  type VisibleResultCase,
  type FixHint,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";
import { formatDurationMs, percentFromRate } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateViewUtils";

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
  nodeHistoryItems: any[];
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
  selectedRunId: string | null;
  selectedRunReportLoading: boolean;
  selectHistoryRun: (id: string) => void;
};

export function ReleaseGateRunOutputSidePanel(props: ReleaseGateRunOutputSidePanelProps) {
  const {
    onClose,
    rightPanelTab,
    setRightPanelTab,
    result,
    repeatRuns,
    toolGroundingRunSummary,
    whatToFixHints,
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
    selectedRunId,
    selectedRunReportLoading,
    selectHistoryRun,
  } = props;

  const historyFiltersAreDefault =
    historyStatus === "all" &&
    historyDatePreset === "all" &&
    !historyTraceId.trim();

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
                    {!result ? (
                      <div className="flex flex-col items-center justify-center py-14 text-center opacity-70">
                        <Activity className="mb-4 h-8 w-8 text-slate-400" />
                        <div className="text-sm font-semibold text-slate-300">Awaiting run</div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                          Select logs or datasets in the left panel, adjust options on the agent card,
                          then press Start. Gate status and per-input rows show up here.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Compact Global Status Banner */}
                        <div
                          className={clsx(
                            "flex flex-col gap-2 rounded-2xl border px-4 py-3",
                            result.pass
                              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                              : "border-rose-500/25 bg-rose-500/10 text-rose-300"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold">
                              {result.pass ? "Healthy gate" : "Flagged gate"}
                            </span>
                            <span className="text-[10px] font-bold text-white/70">
                              Failure rate {percentFromRate(result.fail_rate)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                            <span>Inputs: {Number(result.total_inputs ?? 0)}</span>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span>Repeats: {Number(result.repeat_runs ?? repeatRuns)}</span>
                            {result?.perf && typeof result.perf === "object" && (
                              <>
                                <span className="h-1 w-1 rounded-full bg-white/20" />
                                <span>Avg: {formatDurationMs((result.perf as any).avg_attempt_wall_ms)}</span>
                              </>
                            )}
                          </div>
                          {toolGroundingRunSummary ? (
                            <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2">
                              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                                Tool grounding
                              </div>
                              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-300">
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
                                    className="text-slate-500"
                                    title="Semantic judge did not run (e.g. no OpenAI key)."
                                  >
                                    Semantic judge off {toolGroundingRunSummary.semanticOff}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        {!result.pass && whatToFixHints.length > 0 && (
                          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
                            <div className="text-[11px] font-medium text-amber-200">What to fix first</div>
                            <div className="mt-3 flex flex-col gap-2">
                              {whatToFixHints.map((hint, idx) => (
                                <div
                                  key={hint.key}
                                  className="flex items-start justify-between gap-3 text-sm text-amber-100/90"
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    {idx + 1}. {hint.label}
                                  </span>
                                  <span className="shrink-0 text-xs font-semibold text-amber-400">
                                    {hint.count}x
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-2">
                          <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-[11px] font-medium text-slate-400">Per-input breakdown</div>
                                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                                  Review individual inputs below and open a row to inspect attempts in detail.
                                </p>
                              </div>
                              <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-black/20 p-1">
                                {(
                                  [
                                    { id: "all" as const, label: "All inputs" },
                                    { id: "failed" as const, label: "Needs review" },
                                  ] as const
                                ).map(option => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setResultCaseFilter(option.id)}
                                    className={clsx(
                                      "rounded-lg px-3 py-1.5 text-[11px] font-semibold transition",
                                      resultCaseFilter === option.id
                                        ? "bg-white/[0.12] text-white"
                                        : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                                    )}
                                  >
                                    {option.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {visibleResultCases.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-sm text-slate-500">
                              {resultCaseFilter === "failed"
                                ? "No failed or flaky inputs in this run."
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] font-medium text-slate-400">Recent retained runs</div>
                            <div className="mt-1 text-sm font-semibold text-white">
                              Quick scan for this agent
                            </div>
                            <div className="mt-1 text-xs leading-relaxed text-slate-500">
                              Use this panel to reopen recent retained runs for this agent. Switch to the
                              main History tab for project-wide trace search and full browsing.
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                              <span>
                                {nodeHistoryItems.length}
                                {historyTotal !== nodeHistoryItems.length ? ` of ${historyTotal}` : ""} runs
                              </span>
                              {historyFilterSummary.map(part => (
                                <span
                                  key={part}
                                  className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-slate-400"
                                >
                                  {part}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
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
                                className="w-full cursor-pointer bg-transparent py-2 pl-3 pr-2 text-[11px] font-bold tracking-[0.08em] text-slate-200 outline-none"
                              >
                                <option value="all" className="bg-[#18191e] text-slate-200">
                                  All
                                </option>
                                <option value="pass" className="bg-[#18191e] text-slate-200">
                                  Healthy
                                </option>
                                <option value="fail" className="bg-[#18191e] text-slate-200">
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
                                  setHistoryDatePreset(
                                    e.target.value as "all" | "24h" | "7d" | "30d"
                                  );
                                  setHistoryOffset(0);
                                }}
                                className="w-full cursor-pointer bg-transparent py-2 pl-3 pr-2 text-[11px] font-bold tracking-[0.08em] text-slate-200 outline-none"
                              >
                                <option value="all" className="bg-[#18191e] text-slate-200">
                                  All dates
                                </option>
                                <option value="24h" className="bg-[#18191e] text-slate-200">
                                  Last 24h
                                </option>
                                <option value="7d" className="bg-[#18191e] text-slate-200">
                                  Last 7d
                                </option>
                                <option value="30d" className="bg-[#18191e] text-slate-200">
                                  Last 30d
                                </option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => mutateHistory()}
                              disabled={historyRefreshing}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[11px] font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-60"
                            >
                              <RefreshCcw
                                className={clsx(
                                  "h-3.5 w-3.5",
                                  historyRefreshing && "animate-spin"
                                )}
                              />
                              {historyRefreshing ? "Refreshing..." : "Refresh"}
                            </button>
                          </div>
                        </div>
                        {nodeHistoryItems.length === 0 ? (
                          <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                            <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
                            <p className="text-sm text-slate-500">
                              {historyFiltersAreDefault
                                ? "No retained runs yet for this agent."
                                : "No runs match these filters. Try All or widen the date range."}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {nodeHistoryItems.map(item => (
                              <HistoryRunRowButton
                                key={item.id}
                                item={item}
                                selected={selectedRunId === item.id}
                                loading={
                                  selectedRunReportLoading && selectedRunId === item.id
                                }
                                onClick={() => selectHistoryRun(String(item.id))}
                                testId={`rg-node-history-row-${item.id}`}
                              />
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
