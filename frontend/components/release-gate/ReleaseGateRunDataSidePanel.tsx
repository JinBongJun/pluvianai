"use client";

import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown, ChevronRight } from "lucide-react";
import RailwaySidePanel from "@/components/shared/RailwaySidePanel";
import { RestorationSnapshotBadges } from "@/components/release-gate/RestorationSnapshotBadges";
import {
  type LogsStatusFilter,
  formatDateTime,
  shortText,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";

export type ReleaseGateRunDataSidePanelProps = {
  leftPanelTitle: string;
  validatePanelOpen: boolean;
  onClose: () => void;
  orgId: string;
  projectId: number;
  dataPanelTab: "logs" | "datasets";
  setDataPanelTab: Dispatch<SetStateAction<"logs" | "datasets">>;
  filteredRecentSnapshots: Array<Record<string, unknown>>;
  logsMatchCount: number;
  logsShowLimit: 10 | 20 | 30 | 50 | 100 | 200;
  setLogsShowLimit: Dispatch<SetStateAction<10 | 20 | 30 | 50 | 100 | 200>>;
  recentSnapshotsTotalAvailable: number | undefined;
  recentSnapshots: any[];
  dataSource: "recent" | "datasets";
  runDatasetIds: string[];
  runSnapshotIds: string[];
  setLogsStatusFilter: (f: LogsStatusFilter) => void;
  logsStatusFilter: LogsStatusFilter;
  logsSortMode: "newest" | "oldest";
  setLogsSortMode: Dispatch<SetStateAction<"newest" | "oldest">>;
  recentSnapshotsError: unknown;
  recentSnapshotsErrorMessage: string;
  mutateRecentSnapshots: (() => unknown) | undefined;
  recentSnapshotsLoading: boolean;
  runLocked: boolean;
  baselineSnapshotsById: Map<string, Record<string, unknown>>;
  setRunSnapshotIds: Dispatch<SetStateAction<string[]>>;
  snapshotEvalFailed: (s: Record<string, unknown> | null) => boolean;
  restorationBadgesBySnapshotId: Map<
    string,
    { body: boolean; ctx: boolean; sharedCtx: boolean }
  >;
  openBaselineDetailSnapshot: (s: Record<string, unknown>) => void;
  setDataSource: (s: "recent" | "datasets") => void;
  setRunDatasetIds: Dispatch<SetStateAction<string[]>>;
  datasetsError: unknown;
  datasetsErrorMessage: string;
  mutateDatasets: (() => unknown) | undefined;
  datasetsLoading: boolean;
  datasets: {
    id: string;
    label?: string;
    snapshot_count?: number;
    snapshot_ids?: unknown[];
  }[];
  expandedDatasetId: string | null;
  setExpandedDatasetId: Dispatch<SetStateAction<string | null>>;
  expandedDatasetSnapshotsLoading: boolean;
  datasetSnapshotsLoading: boolean;
  expandedDatasetErrorMessage: string;
  expandedDatasetSnapshots404: boolean;
  datasetSnapshots404: boolean;
  mutateExpandedDatasetSnapshots: (() => unknown) | undefined;
  mutateDatasetSnapshots: (() => unknown) | undefined;
  expandedDatasetSnapshots: Record<string, unknown>[];
};

export function ReleaseGateRunDataSidePanel(props: ReleaseGateRunDataSidePanelProps) {
  const {
    leftPanelTitle,
    validatePanelOpen,
    onClose,
    orgId,
    projectId,
    dataPanelTab,
    setDataPanelTab,
    filteredRecentSnapshots,
    logsMatchCount,
    logsShowLimit,
    setLogsShowLimit,
    recentSnapshotsTotalAvailable,
    recentSnapshots,
    dataSource,
    runDatasetIds,
    runSnapshotIds,
    setLogsStatusFilter,
    logsStatusFilter,
    logsSortMode,
    setLogsSortMode,
    recentSnapshotsError,
    recentSnapshotsErrorMessage,
    mutateRecentSnapshots,
    recentSnapshotsLoading,
    runLocked,
    baselineSnapshotsById,
    setRunSnapshotIds,
    snapshotEvalFailed,
    restorationBadgesBySnapshotId,
    openBaselineDetailSnapshot,
    setDataSource,
    setRunDatasetIds,
    datasetsError,
    datasetsErrorMessage,
    mutateDatasets,
    datasetsLoading,
    datasets,
    expandedDatasetId,
    setExpandedDatasetId,
    expandedDatasetSnapshotsLoading,
    datasetSnapshotsLoading,
    expandedDatasetErrorMessage,
    expandedDatasetSnapshots404,
    datasetSnapshots404,
    mutateExpandedDatasetSnapshots,
    mutateDatasetSnapshots,
    expandedDatasetSnapshots,
  } = props;

  return (
            <RailwaySidePanel
              title={leftPanelTitle}
              headerEyebrow="Run data"
              footerStatusLabel="Validation session active"
              isOpen={validatePanelOpen}
              onClose={onClose}
              side="left"
              width={320}
              showCloseButton={false}
              className="pointer-events-auto"
              tabs={[
                { id: "logs", label: "Live Logs" },
                { id: "datasets", label: "Saved Data" },
              ]}
              tabTestIdPrefix="rg-data-tab"
              activeTab={dataPanelTab}
              onTabChange={id => setDataPanelTab(id as "logs" | "datasets")}
            >
              <div className="flex h-full flex-col">
                <div className="shrink-0 border-b border-white/[0.06] bg-fuchsia-500/[0.04] px-4 py-2.5">
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    <span className="font-medium text-slate-200">Pick inputs</span>
                    {" — "}
                    Use Live Logs or Saved Data below, then press{" "}
                    <span className="font-medium text-slate-200">Start</span> on the agent card in the
                    center.
                  </p>
                </div>
                {dataPanelTab === "logs" && (
                  <div className="flex h-full flex-col" data-testid="rg-data-panel-logs">
                    <div className="space-y-2 border-b border-white/[0.06] bg-black/30 px-4 py-3">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-[11px] font-medium leading-snug text-slate-300">
                          Showing{" "}
                          <span className="font-mono text-slate-100">
                            {filteredRecentSnapshots.length}
                          </span>{" "}
                          of{" "}
                          <span className="font-mono text-slate-100">{logsMatchCount}</span>{" "}
                          logs
                          {logsMatchCount > logsShowLimit ? (
                            <span className="text-slate-500"> · cap {logsShowLimit}</span>
                          ) : null}
                        </div>
                        <div className="text-[10px] leading-snug text-slate-500">
                          Loaded {recentSnapshots.length}
                          {typeof recentSnapshotsTotalAvailable === "number"
                            ? ` of ${recentSnapshotsTotalAvailable} on server`
                            : ""}
                        </div>
                        <div className="text-[10px] font-semibold text-fuchsia-300/90">
                          {dataSource === "datasets"
                            ? runDatasetIds.length > 0
                              ? `Run source: ${runDatasetIds.length} saved dataset${runDatasetIds.length === 1 ? "" : "s"}`
                              : "Run source: saved data (pick a dataset)"
                            : runSnapshotIds.length > 0
                              ? `Selected ${runSnapshotIds.length} log${runSnapshotIds.length === 1 ? "" : "s"}`
                              : "No logs selected for run"}
                        </div>
                      </div>

                      <div className="flex w-full items-center rounded-xl border border-white/[0.08] bg-black/40 p-0.5">
                        {(["all", "failed", "passed"] as LogsStatusFilter[]).map(mode => (
                          <button
                            key={mode}
                            type="button"
                            data-testid={`rg-logs-filter-${mode}`}
                            onClick={() => setLogsStatusFilter(mode)}
                            className={clsx(
                              "min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-[9px] font-bold tracking-[0.08em] transition-all sm:px-2.5 sm:text-[10px] sm:tracking-[0.12em]",
                              logsStatusFilter === mode
                                ? "bg-white/[0.12] text-white shadow-sm"
                                : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
                            )}
                          >
                            {mode === "all" ? "All" : mode === "failed" ? "Flagged" : "Healthy"}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-stretch gap-2">
                        <div className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/40 transition-colors hover:border-white/20 focus-within:border-fuchsia-500/60">
                          <label className="sr-only" htmlFor="rg-logs-show-limit">
                            Max rows to show
                          </label>
                          <select
                            id="rg-logs-show-limit"
                            data-testid="rg-logs-show-limit"
                            value={logsShowLimit}
                            onChange={e =>
                              setLogsShowLimit(
                                Number(e.target.value) as 10 | 20 | 30 | 50 | 100 | 200
                              )
                            }
                            className="h-full w-full cursor-pointer bg-transparent py-2 pl-3 pr-2 text-[10px] font-bold tracking-[0.08em] text-slate-300 outline-none"
                            title="How many matching logs to list"
                          >
                            <option value={10} className="bg-[#18191e] text-slate-200">
                              Show 10
                            </option>
                            <option value={20} className="bg-[#18191e] text-slate-200">
                              Show 20
                            </option>
                            <option value={30} className="bg-[#18191e] text-slate-200">
                              Show 30
                            </option>
                            <option value={50} className="bg-[#18191e] text-slate-200">
                              Show 50
                            </option>
                            <option value={100} className="bg-[#18191e] text-slate-200">
                              Show 100
                            </option>
                            <option value={200} className="bg-[#18191e] text-slate-200">
                              Show 200
                            </option>
                          </select>
                        </div>
                        <div className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-black/40 transition-colors hover:border-white/20 focus-within:border-fuchsia-500/60">
                          <label className="sr-only" htmlFor="rg-logs-sort">
                            Sort order
                          </label>
                          <select
                            id="rg-logs-sort"
                            data-testid="rg-logs-sort"
                            value={logsSortMode}
                            onChange={e => setLogsSortMode(e.target.value as "newest" | "oldest")}
                            className="h-full w-full cursor-pointer bg-transparent py-2 pl-3 pr-2 text-[10px] font-bold tracking-[0.08em] text-slate-300 outline-none"
                          >
                            <option value="newest" className="bg-[#18191e] text-slate-200">
                              Newest
                            </option>
                            <option value="oldest" className="bg-[#18191e] text-slate-200">
                              Oldest
                            </option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                      {recentSnapshotsError ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-error">
                          <div className="text-xs font-medium uppercase tracking-widest text-rose-400">
                            Unable to load recent snapshots
                          </div>
                          <div className="mt-2 text-[11px] text-slate-400">
                            {recentSnapshotsErrorMessage}
                          </div>
                          <button
                            type="button"
                            onClick={() => void mutateRecentSnapshots?.()}
                            className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-white/10"
                          >
                            Retry
                          </button>
                        </div>
                      ) : recentSnapshotsLoading && !recentSnapshots?.length ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-loading">
                          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
                            Loading recent snapshots
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            Fetching baseline logs for this agent...
                          </div>
                        </div>
                      ) : recentSnapshots.length === 0 ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-empty">
                          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
                            No baseline logs yet
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            Generate traffic in Live View, then open this agent again.
                          </div>
                        </div>
                      ) : logsMatchCount === 0 ? (
                        <div className="p-8 text-center" data-testid="rg-logs-state-empty-filter">
                          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">
                            {logsStatusFilter === "failed"
                              ? "No flagged logs in this window"
                              : logsStatusFilter === "passed"
                                ? "No healthy logs in this window"
                                : "No logs match this filter"}
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            Try All, or raise Show limit if matching logs are further back.
                          </div>
                        </div>
                      ) : (
                        <div className="divide-y divide-white/[0.03]" data-testid="rg-logs-state-list">
                          {filteredRecentSnapshots.map((skinny: Record<string, unknown>, idx) => {
                              const full = baselineSnapshotsById.get(String(skinny.id ?? "")) as
                                | Record<string, unknown>
                                | undefined;
                              const snap = (full ?? skinny) as Record<string, unknown>;
                              const rowId = String(skinny.id ?? "");
                              const checked = runSnapshotIds.includes(rowId);
                              const failed = snapshotEvalFailed(full ?? null);
                              const rb = restorationBadgesBySnapshotId.get(rowId);

                              return (
                                <div
                                  key={rowId || `idx-${idx}`}
                                  data-testid={`rg-live-log-row-${rowId}`}
                                  className={clsx(
                                    "group border-l-2 transition-colors",
                                    checked
                                      ? "border-fuchsia-500/70 bg-fuchsia-500/[0.07]"
                                      : "border-transparent hover:bg-white/[0.02]"
                                  )}
                                >
                                  <div
                                    className="flex cursor-pointer items-start gap-2.5 px-3 py-3 sm:gap-3 sm:p-4"
                                    onClick={() => openBaselineDetailSnapshot(snap)}
                                  >
                                    <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={runLocked}
                                        data-testid={`rg-live-log-checkbox-${rowId}`}
                                        onChange={() => {
                                          if (runLocked) return;
                                          const id = rowId;
                                          setRunSnapshotIds(prev =>
                                            prev.includes(id)
                                              ? prev.filter(x => x !== id)
                                              : [...prev, id]
                                          );
                                          setDataSource("recent");
                                          setRunDatasetIds([]);
                                        }}
                                        className="h-4 w-4 rounded border-white/10 bg-black/40 text-fuchsia-500"
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-[11px] font-bold text-slate-300">
                                          {formatDateTime(snap.created_at)}
                                        </span>
                                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                                          <RestorationSnapshotBadges rb={rb} />
                                          <span
                                            className={clsx(
                                              "rounded border px-2 py-0.5 text-[9px] font-black uppercase",
                                              failed
                                                ? "border-rose-500/20 bg-rose-500/10 text-rose-400"
                                                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                            )}
                                          >
                                            {failed ? "FAIL" : "PASS"}
                                          </span>
                                        </div>
                                      </div>
                                      <p className="line-clamp-2 text-[12px] leading-relaxed text-slate-300">
                                        {shortText(
                                          snap.user_message ?? snap.request_prompt ?? "—",
                                          "—",
                                          90
                                        )}
                                      </p>
                                      {Boolean(snap.trace_id) && (
                                        <p
                                          className="truncate font-mono text-[9px] text-slate-600"
                                          title={String(snap.trace_id)}
                                        >
                                          {String(snap.trace_id).slice(0, 14)}…
                                        </p>
                                      )}
                                    </div>
                                    <ChevronRight
                                      className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600 opacity-60 transition group-hover:text-slate-400 group-hover:opacity-100"
                                      aria-hidden
                                    />
                                  </div>
                                </div>
                              );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {dataPanelTab === "datasets" && (
                  <div
                    className="flex-1 overflow-y-auto custom-scrollbar p-4"
                    data-testid="rg-data-panel-datasets"
                  >
                    <div className="mb-3 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[10px] font-semibold text-slate-400">
                      {dataSource === "recent" && runSnapshotIds.length > 0 ? (
                        <span className="text-amber-200/90">
                          Run source: {runSnapshotIds.length} live log
                          {runSnapshotIds.length === 1 ? "" : "s"} (switch source below)
                        </span>
                      ) : runDatasetIds.length > 0 ? (
                        <span className="text-fuchsia-300/90">
                          Selected {runDatasetIds.length} dataset
                          {runDatasetIds.length === 1 ? "" : "s"} for run
                        </span>
                      ) : (
                        <span>No dataset selected for run</span>
                      )}
                    </div>
                    {datasetsError ? (
                      <div
                        className="rounded-2xl border border-dashed border-rose-500/25 bg-rose-500/[0.06] p-8 text-center text-[12px] text-rose-100/90"
                        data-testid="rg-datasets-state-error"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-300">
                          Unable to load saved datasets
                        </div>
                        <div className="mt-2 text-[12px] text-slate-200">{datasetsErrorMessage}</div>
                        <button
                          type="button"
                          onClick={() => void mutateDatasets?.()}
                          className="mt-4 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    ) : datasetsLoading && !datasets?.length ? (
                      <div
                        className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[12px] text-slate-500"
                        data-testid="rg-datasets-state-loading"
                      >
                        Loading saved datasets...
                      </div>
                    ) : !datasets?.length ? (
                      <div
                        className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center text-[12px] text-slate-500"
                        data-testid="rg-datasets-state-empty"
                      >
                        No saved datasets.
                        <div className="mt-2">
                          <Link
                            href={`/organizations/${orgId}/projects/${projectId}/live-view`}
                            className="text-fuchsia-400 hover:text-fuchsia-300"
                          >
                            Go to Live View (DATA tab)
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3" data-testid="rg-datasets-state-list">
                        {datasets.map(
                          (dataset: {
                            id: string;
                            label?: string;
                            snapshot_count?: number;
                            snapshot_ids?: unknown[];
                          }) => {
                            const id = dataset.id;
                            const label = dataset.label || id;
                            const count =
                              typeof dataset.snapshot_count === "number"
                                ? dataset.snapshot_count
                                : Array.isArray(dataset.snapshot_ids)
                                  ? dataset.snapshot_ids.length
                                  : 0;
                            const checked = runDatasetIds.includes(id);
                            const isExpanded = expandedDatasetId === id;
                            return (
                              <div
                                key={id}
                                className={clsx(
                                  "overflow-hidden rounded-2xl border transition-all",
                                  checked
                                    ? "border-fuchsia-500/30 bg-fuchsia-500/[0.06]"
                                    : "border-white/8 bg-white/[0.04]"
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => setExpandedDatasetId(isExpanded ? null : id)}
                                  className="flex w-full items-start gap-2.5 px-3 py-3 text-left sm:gap-3 sm:px-4 sm:py-3.5"
                                >
                                  <div className="pt-0.5" onClick={e => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={runLocked}
                                      onChange={e => {
                                        e.stopPropagation();
                                        if (runLocked) return;
                                        setRunDatasetIds(prev =>
                                          prev.includes(id)
                                            ? prev.filter(x => x !== id)
                                            : [...prev, id]
                                        );
                                        setDataSource("datasets");
                                        setRunSnapshotIds([]);
                                      }}
                                      className="mt-0.5 h-4 w-4 rounded border-white/10 bg-black/40 text-fuchsia-500"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-[13px] font-semibold text-slate-100">
                                          {label}
                                        </div>
                                        <div className="mt-0.5 text-[10px] text-slate-500">
                                          Tap to expand snapshots
                                        </div>
                                      </div>
                                      <div className="shrink-0 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-slate-200">
                                        {count} snaps
                                      </div>
                                    </div>
                                  </div>
                                  <ChevronDown
                                    className={clsx(
                                      "mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform",
                                      isExpanded && "rotate-180"
                                    )}
                                  />
                                </button>

                                {isExpanded && (
                                  <div className="px-4 pb-4">
                                    <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.04]">
                                      {(expandedDatasetSnapshotsLoading || datasetSnapshotsLoading) &&
                                      expandedDatasetId === id ? (
                                        <div className="px-4 py-4 text-sm text-slate-500">
                                          Loading snapshots...
                                        </div>
                                      ) : expandedDatasetErrorMessage ? (
                                        <div className="px-4 py-4 text-sm text-rose-200">
                                          <div>{expandedDatasetErrorMessage}</div>
                                          {!(expandedDatasetSnapshots404 || datasetSnapshots404) && (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                void mutateExpandedDatasetSnapshots?.();
                                                void mutateDatasetSnapshots?.();
                                              }}
                                              className="mt-3 inline-flex items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10 transition-colors"
                                            >
                                              Retry
                                            </button>
                                          )}
                                        </div>
                                      ) : expandedDatasetSnapshots.length === 0 ? (
                                        <div className="px-4 py-4 text-sm text-slate-500">
                                          No snapshots stored in this dataset.
                                        </div>
                                      ) : (
                                        expandedDatasetSnapshots.map((snapshot, idx) => {
                                          const snapRowId = String(
                                            (snapshot as { id?: unknown }).id ?? ""
                                          );
                                          const rbDs = restorationBadgesBySnapshotId.get(snapRowId);
                                          return (
                                            <button
                                              key={snapRowId || `dataset-snap-${idx}`}
                                              type="button"
                                              onClick={() =>
                                                openBaselineDetailSnapshot(
                                                  snapshot as Record<string, unknown>
                                                )
                                              }
                                              className="flex w-full items-start justify-between gap-3 border-b border-white/[0.04] px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/[0.05]"
                                            >
                                              <div className="min-w-0 flex-1">
                                                <div className="truncate text-[13px] font-medium text-slate-100">
                                                  {shortText(
                                                    snapshot.user_message ??
                                                      snapshot.request_prompt ??
                                                      "—",
                                                    "—",
                                                    88
                                                  )}
                                                </div>
                                                <div className="mt-1 flex items-center justify-between gap-2">
                                                  <span className="text-[11px] text-slate-400">
                                                    {formatDateTime(snapshot.created_at)}
                                                  </span>
                                                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                                                    <RestorationSnapshotBadges rb={rbDs} />
                                                  </div>
                                                </div>
                                              </div>
                                              <div className="shrink-0 text-right text-[11px] text-slate-500">
                                                {String(snapshot.trace_id ?? "").slice(0, 12) ||
                                                  "trace"}
                                              </div>
                                            </button>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </RailwaySidePanel>
  );
}
