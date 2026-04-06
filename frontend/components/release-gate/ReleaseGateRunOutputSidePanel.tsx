"use client";
import type { Dispatch, SetStateAction } from "react";
import clsx from "clsx";
import { Activity, Flag, RefreshCcw, Trash2, X } from "lucide-react";
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
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";
import {
  formatDurationMs,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateViewUtils";
import type { CompletedResultPanelCard } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/useReleaseGateExpandedResultPanel";

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
  resultCards: CompletedResultPanelCard[];
  hasCompletedResults: boolean;
  dismissResult: (reportId: string) => void;
  repeatRuns: number;
  resultCaseFilter: ResultCaseFilter;
  setResultCaseFilter: Dispatch<SetStateAction<ResultCaseFilter>>;
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
  historyDeleteLocked: boolean;
  mutateHistory: () => void;
  /** Shared with main History tab; used only to detect ?쐂efault??filters for empty copy. */
  historyTraceId: string;
  deletingHistoryReportIds: string[];
  onDeleteHistorySession: (reportId: string) => void;
  expandedHistoryId: string | null;
  selectedRunReportLoading: boolean;
  selectHistoryRun: (item: ReleaseGateHistoryItem) => void;
};

export function ReleaseGateRunOutputSidePanel(props: ReleaseGateRunOutputSidePanelProps) {
  const {
    onClose,
    rightPanelTab,
    setRightPanelTab,
    resultCards,
    hasCompletedResults,
    dismissResult,
    repeatRuns,
    resultCaseFilter,
    setResultCaseFilter,
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
    historyDeleteLocked,
    mutateHistory,
    historyTraceId,
    deletingHistoryReportIds,
    onDeleteHistorySession,
    expandedHistoryId,
    selectedRunReportLoading,
    selectHistoryRun,
  } = props;

  const historyFiltersAreDefault =
    historyStatus === "all" && historyDatePreset === "all" && !historyTraceId.trim();
  const groupedHistoryItems = groupHistoryItemsBySession(nodeHistoryItems);
  const latestResultCard = resultCards[0] ?? null;
  const earlierResultCards = resultCards.slice(1);

  return (
    <RailwaySidePanel
      title="Results"
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
              className="flex w-full gap-0.5 rounded-xl bg-black/20 p-1 ring-1 ring-white/[0.05]"
              role="group"
              aria-label="Filter result rows"
            >
              {(
                [
                  { id: "all" as const, label: "All" },
                  { id: "failed" as const, label: "Needs review" },
                  { id: "passed" as const, label: "Looks good" },
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

            {resultCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center opacity-70">
                <Activity className="mb-4 h-8 w-8 text-white/40" />
                <div className="text-sm font-semibold text-white/60">
                  {!hasCompletedResults ? "Waiting for a result" : "Latest result hidden"}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                  {!hasCompletedResults
                    ? "Pick inputs on the left, review the candidate in the center, then run the experiment."
                    : "Open History to inspect completed runs, or run the experiment again."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {latestResultCard ? (
                  <div
                    key={latestResultCard.reportId}
                    data-testid="rg-result-report-0"
                    className="space-y-3 rounded-2xl bg-white/[0.02] p-3 ring-1 ring-white/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                          Latest result
                        </div>
                        <div className="mt-1 text-[11px] text-white/45">
                          {formatDateTime(new Date(latestResultCard.completedAtMs).toISOString())}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => dismissResult(latestResultCard.reportId)}
                        className="rounded-md border border-white/10 bg-black/20 p-1 text-white/45 transition hover:text-white"
                        title="Hide latest result"
                        aria-label="Hide latest result"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div
                      className={clsx(
                        "flex flex-col gap-2 rounded-2xl border px-4 py-3",
                        latestResultCard.result.pass
                          ? "border-l-2 border-emerald-500/50 bg-emerald-500/5 text-emerald-100"
                          : "border-l-2 border-rose-500/50 bg-rose-500/5 text-rose-100"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className={clsx(
                            "text-sm font-semibold",
                            latestResultCard.result.pass ? "text-emerald-200" : "text-rose-200"
                          )}
                        >
                          {latestResultCard.result.pass ? "Looks good" : "Needs review"}
                        </div>
                        <div className="text-[11px] text-white/45">
                          {latestResultCard.result.pass
                            ? "All selected inputs passed."
                            : "One or more inputs need review."}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                        <span>Inputs: {Number(latestResultCard.result.total_inputs ?? 0)}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span>Repeats: {Number(latestResultCard.result.repeat_runs ?? repeatRuns)}</span>
                        {latestResultCard.result?.perf && typeof latestResultCard.result.perf === "object" && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-white/20" />
                            <span>
                              Avg: {formatDurationMs((latestResultCard.result.perf as any).avg_attempt_wall_ms)}
                            </span>
                          </>
                        )}
                      </div>
                      {latestResultCard.toolGroundingRunSummary ? (
                        <div className="mt-2 rounded-xl border border-white/8 bg-black/25 px-3 py-2">
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                            Tool grounding
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/60">
                            <span>
                              With tools:{" "}
                              <span className="font-semibold text-white/90">
                                {latestResultCard.toolGroundingRunSummary.withTools}
                              </span>
                            </span>
                            <span className="text-emerald-400/90">
                              Looks good {latestResultCard.toolGroundingRunSummary.pass}
                            </span>
                            <span className="text-rose-400/90">
                              Needs review {latestResultCard.toolGroundingRunSummary.fail}
                            </span>
                            {latestResultCard.toolGroundingRunSummary.semanticOk > 0 ? (
                              <span className="text-violet-300/90">
                                Semantic OK {latestResultCard.toolGroundingRunSummary.semanticOk}
                              </span>
                            ) : null}
                            {latestResultCard.toolGroundingRunSummary.semanticOff > 0 ? (
                              <span
                                className="text-white/30"
                                title="Semantic judge did not run (e.g. no OpenAI key)."
                              >
                                Semantic judge off {latestResultCard.toolGroundingRunSummary.semanticOff}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <details className="group rounded-2xl bg-black/20 ring-1 ring-white/[0.05]">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-white/80 marker:content-none">
                        <span>View case results</span>
                        <span className="text-[11px] text-white/35">Expand</span>
                      </summary>
                      <div className="border-t border-white/6 px-3 py-3">
                        {latestResultCard.visibleResultCases.length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-white/30">
                            {resultCaseFilter === "failed"
                              ? "No inputs need review in this run."
                              : resultCaseFilter === "passed"
                                ? "No healthy inputs in this run."
                                : "No per-input result rows returned for this run."}
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {latestResultCard.visibleResultCases.map(({ run, caseIndex: idx }) => {
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
                                  key={`${latestResultCard.reportId}-${idx}`}
                                  run={run}
                                  idx={idx}
                                  repeatRunsFallback={latestResultCard.result.repeat_runs ?? repeatRuns}
                                  baselineSnapshotForRun={baselineSnapshotForRun}
                                  onSelect={({ attempts, caseIndex, baselineSnapshot }) =>
                                    setDetailAttemptView({
                                      attempts,
                                      caseIndex,
                                      initialAttemptIndex: 0,
                                      baselineSnapshot,
                                    })
                                  }
                                  testId={`rg-result-report-0-case-${idx}`}
                                />
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                ) : null}

                {earlierResultCards.length > 0 ? (
                  <details className="group rounded-2xl bg-black/20 ring-1 ring-white/[0.05]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-white/75 marker:content-none">
                      <span>Earlier results</span>
                      <span className="text-[11px] text-white/35">
                        {earlierResultCards.length} hidden
                      </span>
                    </summary>
                    <div className="space-y-3 border-t border-white/6 px-3 py-3">
                      {earlierResultCards.map((card, idx) => (
                        <details
                          key={card.reportId}
                          data-testid={`rg-result-report-${idx + 1}`}
                          className="group rounded-2xl bg-white/[0.02] p-3 ring-1 ring-white/[0.05]"
                        >
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 marker:content-none">
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                                Earlier result {idx + 1}
                              </div>
                              <div className="mt-1 text-[11px] text-white/45">
                                {formatDateTime(new Date(card.completedAtMs).toISOString())}
                              </div>
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                                <span className={clsx("font-semibold", card.result.pass ? "text-emerald-300" : "text-rose-300")}>
                                  {card.result.pass ? "Looks good" : "Needs review"}
                                </span>
                                <span className="h-1 w-1 rounded-full bg-white/20" />
                                <span>Inputs: {Number(card.result.total_inputs ?? 0)}</span>
                                <span className="h-1 w-1 rounded-full bg-white/20" />
                                <span>Repeats: {Number(card.result.repeat_runs ?? repeatRuns)}</span>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <span className="mt-0.5 text-[11px] text-white/35 group-open:hidden">Expand</span>
                              <span className="mt-0.5 hidden text-[11px] text-white/35 group-open:inline">Collapse</span>
                              <button
                                type="button"
                                onClick={e => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  dismissResult(card.reportId);
                                }}
                                className="rounded-md border border-white/10 bg-black/20 p-1 text-white/45 transition hover:text-white"
                                title="Hide result"
                                aria-label="Hide result"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </summary>
                          <div className="mt-3 border-t border-white/6 pt-3">
                            {card.visibleResultCases.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-4 text-sm text-white/30">
                                {resultCaseFilter === "failed"
                                  ? "No inputs need review in this run."
                                  : resultCaseFilter === "passed"
                                    ? "No healthy inputs in this run."
                                    : "No per-input result rows returned for this run."}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-2">
                                {card.visibleResultCases.map(({ run, caseIndex: caseIndex }) => {
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
                                      key={`${card.reportId}-${caseIndex}`}
                                      run={run}
                                      idx={caseIndex}
                                      repeatRunsFallback={card.result.repeat_runs ?? repeatRuns}
                                      baselineSnapshotForRun={baselineSnapshotForRun}
                                      onSelect={({ attempts, caseIndex: selectedCaseIndex, baselineSnapshot }) =>
                                        setDetailAttemptView({
                                          attempts,
                                          caseIndex: selectedCaseIndex,
                                          initialAttemptIndex: 0,
                                          baselineSnapshot,
                                        })
                                      }
                                      testId={`rg-result-report-${idx + 1}-case-${caseIndex}`}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
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
                  <div className="space-y-4">
                    {groupedHistoryItems.map((group, groupIdx) => {
                      const deleting = deletingHistoryReportIds.includes(group.id);
                      const sessionIsPass = group.sessionStatus === "pass";
                      const sessionIsFlaky = group.sessionStatus === "flaky";
                      const sessionStatusLabel = sessionIsPass
                        ? "Healthy session"
                        : sessionIsFlaky
                          ? "Flaky session"
                          : "Flagged session";
                      return (
                        <div
                          key={group.id}
                          data-testid={`rg-history-report-${groupIdx}`}
                          className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.02] p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                                Validation session
                              </div>
                              <div className="mt-1 text-[11px] text-white/45">
                                {formatDateTime(group.createdAt)}{group.repeatRuns ? ` 쨌 ${group.repeatRuns}x each` : ""}
                              </div>
                            </div>
                            <button
                              type="button"
                              data-testid={`rg-history-delete-${group.id}`}
                              onClick={() => onDeleteHistorySession(group.id)}
                              disabled={historyDeleteLocked || deleting || selectedRunReportLoading}
                              className="rounded-md border border-white/10 bg-black/20 p-1 text-white/45 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                              title="Delete session"
                              aria-label="Delete session"
                            >
                              {deleting ? (
                                <Activity className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>

                          <div
                            className={clsx(
                              "flex flex-col gap-2 rounded-2xl border px-4 py-3",
                              sessionIsPass
                                ? "border-l-2 border-emerald-500/50 bg-emerald-500/5 text-emerald-100"
                                : sessionIsFlaky
                                  ? "border-l-2 border-amber-500/50 bg-amber-500/5 text-amber-100"
                                  : "border-l-2 border-rose-500/50 bg-rose-500/5 text-rose-100"
                            )}
                          >
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/60">
                              <span>{sessionStatusLabel}</span>
                              <span className="h-1 w-1 rounded-full bg-white/20" />
                              <span>Inputs: {group.totalInputs}</span>
                              {group.repeatRuns ? (
                                <>
                                  <span className="h-1 w-1 rounded-full bg-white/20" />
                                  <span>Repeats: {group.repeatRuns}</span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-col gap-2">
                            {group.items.map(item => (
                              <HistoryRunRowButton
                                key={item.id}
                                item={item}
                                selected={expandedHistoryId === item.id}
                                loading={deleting || (selectedRunReportLoading && expandedHistoryId === item.id)}
                                onClick={() => selectHistoryRun(item)}
                                testId={`rg-node-history-row-${item.id}`}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
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
