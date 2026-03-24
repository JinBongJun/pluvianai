"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  ChevronLeft,
  CheckSquare,
  Square,
  Activity,
  Database,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import useSWR from "swr";
import { AgentPickerCard } from "./AgentPickerCard";
import type { AgentForPicker } from "./AgentPickerCard";
import { behaviorAPI, liveViewAPI, releaseGateAPI } from "@/lib/api";

type DatasetSummary = {
  id: string;
  label?: string;
  agent_id?: string;
  created_at?: string;
  snapshot_ids?: unknown[];
  snapshot_count?: number;
};

type RecentSnapshotItem = { id: string; trace_id?: string; created_at?: string };

export type NodeAndDataSelection =
  | { agent: AgentForPicker; dataSource: "recent"; snapshotIds: string[] }
  | { agent: AgentForPicker; dataSource: "datasets"; datasetIds: string[] };

type NodeAndDataPickerModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: number;
  agents: AgentForPicker[];
  agentsLoading: boolean;
  initialAgent: AgentForPicker | null;
  initialDataSource: "recent" | "datasets";
  initialSnapshotIds: string[];
  initialDatasetIds: string[];
  lockAgent?: boolean;
  onConfirm: (selection: NodeAndDataSelection) => void;
};

type Step = "node" | "data";

const RECENT_LIST_LIMIT = 100;
const RECENT_QUICK_SELECT = [10, 25, 50, 100];

export function NodeAndDataPickerModal({
  open,
  onClose,
  projectId,
  agents,
  agentsLoading,
  initialAgent,
  initialDataSource,
  initialSnapshotIds,
  initialDatasetIds,
  lockAgent,
  onConfirm,
}: NodeAndDataPickerModalProps) {
  const [step, setStep] = useState<Step>("node");
  const [pickedAgent, setPickedAgent] = useState<AgentForPicker | null>(initialAgent);
  const [dataSource, setDataSource] = useState<"recent" | "datasets">(initialDataSource);
  const [tempSnapshotIds, setTempSnapshotIds] = useState<Set<string>>(new Set(initialSnapshotIds));
  const [tempDatasetIds, setTempDatasetIds] = useState<Set<string>>(new Set(initialDatasetIds));
  const [expandedDatasetId, setExpandedDatasetId] = useState<string | null>(null);
  const [recentSort, setRecentSort] = useState<"newest" | "oldest">("newest");
  const [recommendedAppliedAgentId, setRecommendedAppliedAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(initialAgent ? "data" : "node");
      setPickedAgent(initialAgent);
      setDataSource(initialDataSource);
      setTempSnapshotIds(new Set(initialSnapshotIds));
      setTempDatasetIds(new Set(initialDatasetIds));
      setExpandedDatasetId(null);
      setRecommendedAppliedAgentId(null);
    }
  }, [open, initialAgent, initialDataSource, initialSnapshotIds, initialDatasetIds]);

  const datasetsKey =
    open &&
    step === "data" &&
    dataSource === "datasets" &&
    pickedAgent &&
    projectId &&
    !isNaN(projectId)
      ? ["behavior-datasets", projectId, pickedAgent.agent_id]
      : null;
  const { data: datasetsData, isLoading: datasetsLoading } = useSWR(datasetsKey, () =>
    behaviorAPI.listDatasets(projectId, { agent_id: pickedAgent!.agent_id, limit: 50 })
  );
  const datasets: DatasetSummary[] = datasetsData?.items ?? [];

  const previewSnapshotsKey =
    open && dataSource === "datasets" && expandedDatasetId && projectId && !isNaN(projectId)
      ? ["behavior-dataset-snapshots-preview", projectId, expandedDatasetId]
      : null;
  const { data: previewSnapshotsData, isLoading: previewSnapshotsLoading } = useSWR(
    previewSnapshotsKey,
    () => behaviorAPI.getDatasetSnapshots(projectId, expandedDatasetId!)
  );
  const previewSnapshots = previewSnapshotsData?.items ?? [];

  const recentListKey =
    open &&
    step === "data" &&
    dataSource === "recent" &&
    pickedAgent &&
    projectId &&
    !isNaN(projectId)
      ? ["release-gate-recent-list", projectId, pickedAgent.agent_id, RECENT_LIST_LIMIT]
      : null;
  const {
    data: recentListData,
    isLoading: recentListLoading,
    error: recentListError,
  } = useSWR(recentListKey, () =>
    releaseGateAPI.getRecentSnapshots(projectId, pickedAgent!.agent_id, RECENT_LIST_LIMIT)
  );
  const recentFallbackKey =
    open &&
    step === "data" &&
    dataSource === "recent" &&
    pickedAgent &&
    projectId &&
    !isNaN(projectId) &&
    recentListError
      ? ["release-gate-recent-fallback", projectId, pickedAgent.agent_id, RECENT_LIST_LIMIT]
      : null;
  const {
    data: recentFallbackData,
    isLoading: recentFallbackLoading,
    error: recentFallbackError,
  } = useSWR(recentFallbackKey, () =>
    liveViewAPI.listSnapshots(projectId, {
      agent_id: pickedAgent!.agent_id,
      limit: RECENT_LIST_LIMIT,
      offset: 0,
    })
  );
  const recentItemsSource =
    Array.isArray(recentListData?.items) && recentListData.items.length > 0
      ? recentListData.items
      : (recentFallbackData?.items ?? recentListData?.items ?? []);
  const recentSnapshotsRaw: RecentSnapshotItem[] = recentItemsSource.map(
    (s: { id: string | number; trace_id?: string; created_at?: string }) => ({
      id: String(s.id),
      trace_id: s.trace_id,
      created_at: s.created_at,
    })
  );
  const recentSnapshots =
    recentSort === "oldest" ? [...recentSnapshotsRaw].reverse() : recentSnapshotsRaw;
  const totalAvailable =
    recentListData?.total_available ??
    (typeof recentFallbackData?.count === "number" ? recentFallbackData.count : null);
  const recentCount = recentSnapshots.length;
  const isRecentLoading = recentListLoading || recentFallbackLoading;
  const recentLoadError = recentListError && recentFallbackError;

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (step === "data") setStep("node");
        else onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, step, onClose]);

  const handleSelectAgent = (agent: AgentForPicker) => {
    setPickedAgent(agent);
    setDataSource("recent");
    setTempSnapshotIds(new Set());
    setTempDatasetIds(new Set());
    setRecommendedAppliedAgentId(null);
    setStep("data");
  };

  const toggleSnapshot = (id: string) => {
    setTempSnapshotIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllRecent = () => {
    if (tempSnapshotIds.size >= recentSnapshots.length) {
      setTempSnapshotIds(new Set());
    } else {
      setTempSnapshotIds(new Set(recentSnapshots.map(s => s.id)));
    }
  };

  const handleQuickSelectRecent = (n: number) => {
    const ids = recentSnapshots.slice(0, n).map(s => s.id);
    setTempSnapshotIds(new Set(ids));
  };

  const toggleDataset = (id: string) => {
    setTempDatasetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllDatasets = () => {
    if (tempDatasetIds.size >= datasets.length) {
      setTempDatasetIds(new Set());
    } else {
      setTempDatasetIds(new Set(datasets.map(d => d.id)));
    }
  };

  const handleBack = () => {
    setStep("node");
    setPickedAgent(null);
    setDataSource(initialDataSource);
    setTempSnapshotIds(new Set(initialSnapshotIds));
    setTempDatasetIds(new Set());
  };

  const canConfirm =
    pickedAgent &&
    (dataSource === "recent"
      ? tempSnapshotIds.size > 0
      : dataSource === "datasets" && tempDatasetIds.size > 0);

  const handleConfirm = () => {
    if (!pickedAgent || !canConfirm) return;
    if (dataSource === "recent") {
      onConfirm({
        agent: pickedAgent,
        dataSource: "recent",
        snapshotIds: Array.from(tempSnapshotIds),
      });
    } else {
      onConfirm({
        agent: pickedAgent,
        dataSource: "datasets",
        datasetIds: Array.from(tempDatasetIds),
      });
    }
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="node-data-picker-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-7xl max-h-[90vh] flex flex-col rounded-2xl border border-white/10 bg-[#111216] shadow-2xl">
        <div className="flex items-center justify-between shrink-0 px-5 py-4 border-b border-white/10">
          {step === "node" ? (
            <h2 id="node-data-picker-title" className="text-base font-bold text-white">
              Select agent & data
            </h2>
          ) : (
            <div className="flex items-center gap-2">
              {!lockAgent && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
                  aria-label="Back to agent selection"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <h2 id="node-data-picker-title" className="text-base font-bold text-white">
                Select data for {pickedAgent?.display_name || pickedAgent?.agent_id || "agent"}
              </h2>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {step === "node" && (
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
            <p className="text-xs text-slate-500 mb-3">
              Choose an agent, then pick Live Logs or saved datasets.
            </p>
            {agentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" aria-hidden />
              </div>
            ) : agents.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No agents yet. Run flows in Live View to see agents here.
              </p>
            ) : (
              agents.map(agent => (
                <AgentPickerCard
                  key={agent.agent_id}
                  agent={agent}
                  onSelect={() => handleSelectAgent(agent)}
                />
              ))
            )}
          </div>
        )}

        {step === "data" && pickedAgent && (
          <>
            {/* Data source: Live View logs vs Saved datasets */}
            <div className="px-5 pt-4 shrink-0">
              <p className="text-xs text-slate-500 mb-3">Choose where to get data from:</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDataSource("recent")}
                  className={`text-left rounded-xl border-2 px-4 py-3 transition-all flex items-start gap-3 ${
                    dataSource === "recent"
                      ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <Activity
                    className={`w-5 h-5 shrink-0 mt-0.5 ${dataSource === "recent" ? "text-fuchsia-400" : "text-slate-500"}`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Live Logs</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Use recent logs from this agent (no save needed)
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setDataSource("datasets")}
                  className={`text-left rounded-xl border-2 px-4 py-3 transition-all flex items-start gap-3 ${
                    dataSource === "datasets"
                      ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/5"
                  }`}
                >
                  <Database
                    className={`w-5 h-5 shrink-0 mt-0.5 ${dataSource === "datasets" ? "text-fuchsia-400" : "text-slate-500"}`}
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-100">Saved datasets</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Pick from agent-scoped datasets you saved (e.g. Saved set 2026-03-02)
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {dataSource === "recent" && (
              <>
                <div className="px-5 py-3 border-t border-white/5 bg-white/[0.02] shrink-0 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 font-medium">
                    {!isRecentLoading && (
                      <>
                        This agent has{" "}
                        <span className="font-semibold text-slate-200">{recentCount}</span> recent
                        log{recentCount !== 1 ? "s" : ""}. Select
                        which to use:
                      </>
                    )}
                    {isRecentLoading && "Loading…"}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {RECENT_QUICK_SELECT.map(n => {
                      const disabled = recentSnapshots.length < n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => !disabled && handleQuickSelectRecent(n)}
                          disabled={disabled}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-slate-300 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Last {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-2 border-t border-white/5 shrink-0 flex-wrap gap-2">
                  <span className="text-xs text-slate-400 font-medium">
                    {tempSnapshotIds.size} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      Sort:
                    </span>
                    <button
                      type="button"
                      onClick={() => setRecentSort(s => (s === "newest" ? "oldest" : "newest"))}
                      className="px-2 py-1 rounded text-xs font-medium text-slate-400 hover:text-slate-200 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      {recentSort === "newest" ? "Newest first" : "Oldest first"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAllRecent}
                      className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                    >
                      {tempSnapshotIds.size >= recentSnapshots.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                </div>
                <div
                  className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2"
                  style={{ minHeight: 200 }}
                >
                  {isRecentLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-500" aria-hidden />
                    </div>
                  ) : recentLoadError ? (
                    <p className="text-sm text-rose-400 text-center py-8">
                      Failed to load recent runs. Please refresh and try again.
                    </p>
                  ) : recentSnapshots.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      No recent logs for this agent. Run flows in Live View to see logs here.
                    </p>
                  ) : (
                    recentSnapshots.map(snap => {
                      const isSelected = tempSnapshotIds.has(snap.id);
                      return (
                        <button
                          key={snap.id}
                          type="button"
                          onClick={() => toggleSnapshot(snap.id)}
                          className={`w-full text-left rounded-xl border px-4 py-3 transition-all flex items-start gap-3 ${
                            isSelected
                              ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                              : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/5"
                          }`}
                          aria-checked={isSelected}
                        >
                          <div
                            className={`mt-0.5 shrink-0 ${isSelected ? "text-fuchsia-400" : "text-slate-600"}`}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-5 h-5" />
                            ) : (
                              <Square className="w-5 h-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-100 truncate font-mono">
                              {`Snapshot ${snap.id}`}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {snap.created_at ? new Date(snap.created_at).toLocaleString() : "—"}
                              {snap.trace_id
                                ? ` · Trace ${String(snap.trace_id).slice(0, 12)}…`
                                : ""}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {dataSource === "datasets" && (
              <>
                <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-white/[0.02] shrink-0">
                  <span className="text-xs text-slate-400 font-medium">
                    {tempDatasetIds.size} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectAllDatasets}
                    className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
                  >
                    {tempDatasetIds.size >= datasets.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div
                  className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2"
                  style={{ minHeight: 200 }}
                >
                  {datasetsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-500" aria-hidden />
                    </div>
                  ) : datasets.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">
                      No saved datasets for this agent. Save a dataset from Live View (DATA tab).
                    </p>
                  ) : (
                    datasets.map(dataset => {
                      const isSelected = tempDatasetIds.has(dataset.id);
                      const isExpanded = expandedDatasetId === dataset.id;
                      return (
                        <div key={dataset.id} className="space-y-1">
                          <div
                            className={`w-full text-left rounded-xl border px-4 py-3 transition-all flex items-start gap-3 ${
                              isSelected
                                ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                                : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/5"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => toggleDataset(dataset.id)}
                              className="flex items-start gap-3 min-w-0 flex-1 text-left"
                              aria-checked={isSelected}
                            >
                              <div
                                className={`mt-0.5 shrink-0 ${isSelected ? "text-fuchsia-400" : "text-slate-600"}`}
                              >
                                {isSelected ? (
                                  <CheckSquare className="w-5 h-5" />
                                ) : (
                                  <Square className="w-5 h-5" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-100 truncate">
                                  {dataset.label || dataset.id}
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5 truncate">
                                  {dataset.created_at && (
                                    <span title="Date this selection was saved. Contents may be from different dates.">
                                      Saved on: {new Date(dataset.created_at).toLocaleString()}
                                    </span>
                                  )}
                                  {(typeof dataset.snapshot_count === "number" ||
                                    Array.isArray(dataset.snapshot_ids)) && (
                                    <span className="ml-2">
                                      ·{" "}
                                      {typeof dataset.snapshot_count === "number"
                                        ? dataset.snapshot_count
                                        : (dataset.snapshot_ids?.length ?? 0)}{" "}
                                      runs
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedDatasetId(id => (id === dataset.id ? null : dataset.id));
                              }}
                              className="shrink-0 px-2 py-1 rounded text-xs font-medium text-slate-400 hover:text-fuchsia-400 transition-colors flex items-center gap-1"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              {isExpanded ? "Hide" : "View"}
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 ml-4 max-h-48 overflow-y-auto">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                                Contents
                              </div>
                              {previewSnapshotsLoading ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2
                                    className="w-5 h-5 animate-spin text-slate-500"
                                    aria-hidden
                                  />
                                </div>
                              ) : previewSnapshots.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  No snapshots in this dataset.
                                </p>
                              ) : (
                                <ul className="space-y-1 text-xs text-slate-300">
                                  {previewSnapshots
                                    .slice(0, 20)
                                    .map(
                                      (snap: {
                                        id?: string;
                                        trace_id?: string;
                                        created_at?: string;
                                      }) => (
                                        <li key={snap.id} className="truncate font-mono">
                                          {snap.trace_id
                                            ? `Trace ${String(snap.trace_id).slice(0, 12)}…`
                                            : `Snapshot ${snap.id}`}
                                          {snap.created_at && (
                                            <span className="text-slate-500 ml-2">
                                              {new Date(snap.created_at).toLocaleString()}
                                            </span>
                                          )}
                                        </li>
                                      )
                                    )}
                                  {previewSnapshots.length > 20 && (
                                    <li className="text-slate-500">
                                      … and {previewSnapshots.length - 20} more
                                    </li>
                                  )}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            <div className="p-5 border-t border-white/10 shrink-0 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-fuchsia-900/20 transition-all"
              >
                {dataSource === "recent"
                  ? `Confirm (${tempSnapshotIds.size} snapshots)`
                  : `Confirm (${tempDatasetIds.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
