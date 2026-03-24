"use client";

import type { Dispatch, SetStateAction } from "react";
import clsx from "clsx";
import { Flag, RefreshCcw } from "lucide-react";
import { HistoryRunRowButton } from "@/components/release-gate/ReleaseGateRowButtons";

export type ReleaseGateHistoryExplorerProps = {
  historyStatus: "all" | "pass" | "fail";
  setHistoryStatus: (s: "all" | "pass" | "fail") => void;
  historyDatePreset: "all" | "24h" | "7d" | "30d";
  setHistoryDatePreset: (p: "all" | "24h" | "7d" | "30d") => void;
  historyTraceId: string;
  setHistoryTraceId: (s: string) => void;
  historyRefreshing: boolean;
  mutateHistory: () => void;
  historyDateSummary: string;
  historyLoading: boolean;
  historyItems: any[];
  historyTotal: number;
  selectedRunId: string | null;
  selectedRunReportLoading: boolean;
  selectHistoryRun: (id: string) => void;
  historyOffset: number;
  historyLimit: number;
  setHistoryOffset: Dispatch<SetStateAction<number>>;
};

export function ReleaseGateHistoryExplorer({
  historyStatus,
  setHistoryStatus,
  historyDatePreset,
  setHistoryDatePreset,
  historyTraceId,
  setHistoryTraceId,
  historyRefreshing,
  mutateHistory,
  historyDateSummary,
  historyLoading,
  historyItems,
  historyTotal,
  selectedRunId,
  selectedRunReportLoading,
  selectHistoryRun,
  historyOffset,
  historyLimit,
  setHistoryOffset,
}: ReleaseGateHistoryExplorerProps) {
  return (
    <div className="mx-6 mt-24 space-y-6 rounded-3xl border border-white/5 bg-[#111216] p-7 shadow-xl pointer-events-auto">
      <div className="space-y-2">
        <div className="text-[11px] font-medium text-slate-400">History explorer</div>
        <div className="text-lg font-semibold text-white">Search and reopen validation runs</div>
        <p className="max-w-3xl text-sm leading-6 text-slate-400">
          Use filters here for full run browsing across this agent, including trace search and paginated
          history results.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={historyStatus}
          onChange={e => {
            setHistoryStatus(e.target.value as "all" | "pass" | "fail");
            setHistoryOffset(0);
          }}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
        >
          <option value="all">All</option>
          <option value="pass">Passed</option>
          <option value="fail">Failed</option>
        </select>
        <select
          value={historyDatePreset}
          onChange={e => {
            setHistoryDatePreset(e.target.value as "all" | "24h" | "7d" | "30d");
            setHistoryOffset(0);
          }}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
        >
          <option value="all">All dates</option>
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7d</option>
          <option value="30d">Last 30d</option>
        </select>
        <input
          value={historyTraceId}
          onChange={e => {
            setHistoryTraceId(e.target.value);
            setHistoryOffset(0);
          }}
          placeholder="Filter by trace ID"
          className="w-48 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={() => mutateHistory()}
          disabled={historyRefreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-60"
        >
          <RefreshCcw className={clsx("h-3.5 w-3.5", historyRefreshing && "animate-spin")} />
          {historyRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
          {historyDateSummary}
        </span>
        {historyTraceId.trim() ? (
          <span className="rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1">
            Trace {historyTraceId.trim()}
          </span>
        ) : null}
      </div>
      {historyLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-16 rounded-lg border border-white/5 bg-white/5 animate-pulse"
            />
          ))}
        </div>
      ) : historyItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
          <Flag className="mx-auto mb-2 h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-500">No validation runs yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {historyItems.map(item => (
            <HistoryRunRowButton
              key={item.id}
              item={item}
              selected={selectedRunId === item.id}
              loading={selectedRunReportLoading && selectedRunId === item.id}
              onClick={() => selectHistoryRun(String(item.id))}
              testId={`rg-main-history-row-${item.id}`}
            />
          ))}
        </div>
      )}
      {!historyLoading && historyItems.length > 0 && (
        <div className="flex items-center justify-between border-t border-white/10 pt-2 text-xs text-slate-400">
          <span>
            {historyTotal} {historyTotal === 1 ? "run" : "runs"}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={historyOffset <= 0}
              onClick={() => setHistoryOffset((value: number) => Math.max(0, value - historyLimit))}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={historyOffset + historyLimit >= historyTotal}
              onClick={() => setHistoryOffset((value: number) => value + historyLimit)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-slate-300 hover:bg-white/5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
