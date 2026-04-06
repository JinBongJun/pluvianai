"use client";

import clsx from "clsx";
import { Save, Trash2, XCircle } from "lucide-react";

type RiskFilter = "all" | "worst" | "healthy";
type SortMode = "newest" | "oldest" | "latency_desc" | "latency_asc";

export function LiveIssuesToolbar({
  visibleCount,
  loadedCount,
  totalCount,
  recentTraceLimit,
  riskFilter,
  riskFilterLabels,
  sortMode,
  sortLabels,
  logLimitOptions,
  onRiskFilterChange,
  onRecentTraceLimitChange,
  onSortModeChange,
  isSelectMode,
  isRemoveMode,
  selectedIdsSize,
  selectedRemoveIdsSize,
  visibleSnapshotsCount,
  isSavingToDatasets,
  isDeletingSnapshots,
  onToggleSelectMode,
  onToggleRemoveMode,
  onSelectAll,
  onSelectAllForRemove,
  onOpenSaveModal,
  onDeleteSelected,
}: {
  visibleCount: number;
  loadedCount: number;
  totalCount: number;
  recentTraceLimit: number;
  riskFilter: RiskFilter;
  riskFilterLabels: Record<RiskFilter, string>;
  sortMode: SortMode;
  sortLabels: Record<SortMode, string>;
  logLimitOptions: readonly number[];
  onRiskFilterChange: (value: RiskFilter) => void;
  onRecentTraceLimitChange: (value: number) => void;
  onSortModeChange: (value: SortMode) => void;
  isSelectMode: boolean;
  isRemoveMode: boolean;
  selectedIdsSize: number;
  selectedRemoveIdsSize: number;
  visibleSnapshotsCount: number;
  isSavingToDatasets: boolean;
  isDeletingSnapshots: boolean;
  onToggleSelectMode: () => void;
  onToggleRemoveMode: () => void;
  onSelectAll: () => void;
  onSelectAllForRemove: () => void;
  onOpenSaveModal: () => void;
  onDeleteSelected: () => void;
}) {
  const showingSummary =
    totalCount > loadedCount
      ? `Showing ${loadedCount} of ${totalCount} snapshots`
      : `${loadedCount} of ${totalCount} snapshots`;
  const hasPartiallyLoadedList = totalCount > loadedCount;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.04] bg-[#18191e] p-5">
      <div className="flex flex-col items-start gap-1">
        <span className="rounded-md px-2 py-0.5 font-mono text-[13px] tracking-wide text-slate-400">
          {showingSummary}
        </span>
        <span className="pl-2 text-[11px] font-medium text-slate-500">
          {hasPartiallyLoadedList
            ? "Recent snapshots first. Sorting applies to loaded snapshots."
            : "Recent snapshots first."}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center rounded-xl border border-white/[0.04] bg-[#030806] p-1 shadow-inner">
          {(["all", "worst", "healthy"] as RiskFilter[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => onRiskFilterChange(mode)}
              aria-pressed={riskFilter === mode}
              title={
                mode === "worst"
                  ? "Show cases that need attention"
                  : mode === "healthy"
                    ? "Show cases that look good"
                    : "All"
              }
              className={clsx(
                "touch-manipulation rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70",
                riskFilter === mode
                  ? "bg-white/[0.08] text-white shadow-sm"
                  : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
              )}
            >
              {riskFilterLabels[mode]}
            </button>
          ))}
        </div>

        <div className="hidden h-4 w-px bg-white/10 md:block" />

        <div className="rounded-xl border border-white/[0.04] bg-[#030806] transition-colors hover:border-white/10 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-400/30">
          <label className="sr-only" htmlFor="clinical-log-show-limit">
            Show logs limit
          </label>
          <select
            id="clinical-log-show-limit"
            value={recentTraceLimit}
            onChange={event => onRecentTraceLimitChange(Number(event.target.value))}
            className="cursor-pointer bg-transparent py-1.5 pl-3 pr-2 text-sm font-medium text-slate-300 focus-visible:outline-none"
            title="Show logs limit"
          >
            {logLimitOptions.map(limit => (
              <option key={limit} value={limit} className="bg-[#18191e] text-slate-200">
                {`Show ${limit}`}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-white/[0.04] bg-[#030806] transition-colors hover:border-white/10 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-400/30">
          <select
            value={sortMode}
            onChange={event => onSortModeChange(event.target.value as SortMode)}
            className="cursor-pointer bg-transparent py-1.5 pl-3 pr-2 text-sm font-medium text-slate-300 focus-visible:outline-none"
          >
            {(Object.keys(sortLabels) as SortMode[]).map(mode => (
              <option key={mode} value={mode} className="bg-[#18191e] text-slate-200">
                {sortLabels[mode]}
              </option>
            ))}
          </select>
        </div>

        <div className="hidden h-4 w-px bg-white/10 md:block" />

        <button
          type="button"
          onClick={onToggleSelectMode}
          className={clsx(
            "touch-manipulation flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70",
            isSelectMode
              ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
              : "border-white/[0.08] bg-transparent text-slate-400 hover:border-white/15 hover:bg-white/[0.03] hover:text-slate-200"
          )}
        >
          {isSelectMode ? <XCircle className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {isSelectMode ? "Cancel" : "Select"}
        </button>

        {isSelectMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelectAll}
              className="rounded-xl border border-white/[0.04] bg-[#030806] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            >
              {selectedIdsSize === visibleSnapshotsCount ? "Deselect" : "Select all"}
            </button>
            <button
              type="button"
              onClick={onOpenSaveModal}
              disabled={selectedIdsSize === 0}
              className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-all hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 disabled:opacity-50"
            >
              {isSavingToDatasets ? "Saving..." : `Save (${selectedIdsSize})`}
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onToggleRemoveMode}
          className={clsx(
            "touch-manipulation flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70",
            isRemoveMode
              ? "border-rose-500/30 bg-rose-500/20 text-rose-300"
              : "border-white/[0.08] bg-transparent text-slate-400 hover:border-white/15 hover:bg-white/[0.03] hover:text-slate-200"
          )}
        >
          {isRemoveMode ? <XCircle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          {isRemoveMode ? "Cancel" : "Delete"}
        </button>

        {isRemoveMode ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelectAllForRemove}
              className="rounded-xl border border-white/[0.04] bg-[#030806] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70"
            >
              {selectedRemoveIdsSize === visibleSnapshotsCount ? "Deselect" : "Select all"}
            </button>
            <button
              type="button"
              onClick={onDeleteSelected}
              disabled={selectedRemoveIdsSize === 0 || isDeletingSnapshots}
              className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 disabled:opacity-50"
            >
              {isDeletingSnapshots
                ? "Deleting..."
                : selectedRemoveIdsSize === 0
                  ? "Delete"
                  : `Delete (${selectedRemoveIdsSize})`}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
