"use client";

import React, { useMemo, useState } from "react";
import useSWR, { type KeyedMutator } from "swr";
import clsx from "clsx";
import { AnimatePresence } from "framer-motion";
import {
  Database,
  FileArchive,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
} from "lucide-react";
import { behaviorAPI, liveViewAPI } from "@/lib/api";
import { toEvalRows } from "@/lib/evalRows";
import {
  SnapshotDetailModal,
  type SnapshotForDetail,
} from "@/components/shared/SnapshotDetailModal";
import { useToast } from "@/components/ToastContainer";

interface ClinicalLogDataSectionProps {
  projectId: number;
  agentId: string;
}

interface DatasetItem {
  id: string;
  project_id: number;
  agent_id?: string | null;
  trace_ids?: string[] | null;
  snapshot_ids?: number[] | null;
  snapshot_count?: number | null;
  label?: string | null;
  tag?: string | null;
  created_at?: string | null;
}

type DatasetSnapshotItem = {
  id: string | number;
  trace_id?: string | null;
  created_at?: string | null;
  eval_checks_result?: Record<string, unknown> | null;
};

type MutateDatasetSnapshots = KeyedMutator<{ items?: DatasetSnapshotItem[]; total?: number }>;

/** Loads one dataset's snapshots when expanded (Phase 4 lazy load). */
function DatasetSnapshotList({
  projectId,
  agentId,
  dataset,
  isExpanded,
  onOpenDetail,
  onRemoveLog,
  removingKey,
  isClearingAll,
}: {
  projectId: number;
  agentId: string;
  dataset: DatasetItem;
  isExpanded: boolean;
  onOpenDetail: (snap: DatasetSnapshotItem) => void;
  onRemoveLog: (
    datasetId: string,
    snapshotId: string | number,
    options: {
      currentSnapshots: DatasetSnapshotItem[];
      mutateThisDataset: MutateDatasetSnapshots;
    }
  ) => Promise<void>;
  removingKey: string | null;
  isClearingAll: boolean;
}) {
  const { data, isLoading, mutate } = useSWR<{ items?: DatasetSnapshotItem[]; total?: number }>(
    projectId && dataset.id && isExpanded
      ? ["behavior-dataset-snapshots", projectId, dataset.id]
      : null,
    () => behaviorAPI.getDatasetSnapshots(projectId, dataset.id)
  );
  const snapshots = (Array.isArray(data?.items) ? data.items : []) as DatasetSnapshotItem[];
  const datasetLabel = dataset.label?.trim() || `Dataset ${dataset.id.slice(0, 8)}`;

  if (!isExpanded) return null;
  if (isLoading) {
    return (
      <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
          Loading logs…
        </div>
      </div>
    );
  }
  if (snapshots.length === 0) {
    return (
      <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] text-xs text-slate-500">
        No logs in this dataset.
      </div>
    );
  }
  return (
    <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] space-y-2">
      {snapshots.map(snap => {
        const removeKey = `${dataset.id}-${snap.id}`;
        const isRemoving = removingKey === removeKey;
        return (
          <div
            key={String(snap.id)}
            className="rounded-lg border border-white/5 bg-black/20 flex items-center gap-3 p-2"
          >
            <button
              type="button"
              onClick={() => onOpenDetail(snap)}
              className="flex-1 min-w-0 text-left"
              title="Open snapshot details"
            >
              <div className="text-sm text-slate-200 font-mono truncate">
                {snap.trace_id
                  ? `Trace ${String(snap.trace_id).slice(0, 16)}...`
                  : `Snapshot ${String(snap.id)}`}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {formatDate(snap.created_at ?? dataset.created_at)}
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                onRemoveLog(dataset.id, snap.id, {
                  currentSnapshots: snapshots,
                  mutateThisDataset: mutate,
                })
              }
              disabled={isRemoving || isClearingAll}
              className="shrink-0 p-2 rounded-lg border border-transparent text-slate-500 hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
              title="Remove this log from dataset"
            >
              {isRemoving ? (
                <span className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ClinicalLogDataSection: React.FC<ClinicalLogDataSectionProps> = ({
  projectId,
  agentId,
}) => {
  const toast = useToast();
  const { data, error, isLoading, mutate } = useSWR(
    projectId && agentId ? ["behavior-datasets", projectId, agentId] : null,
    () => behaviorAPI.listDatasets(projectId, { agent_id: agentId, limit: 50, offset: 0 }),
    { keepPreviousData: true }
  );
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<SnapshotForDetail | null>(null);
  const [expandedDatasetIds, setExpandedDatasetIds] = useState<Set<string>>(new Set());
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenamingDataset, setIsRenamingDataset] = useState(false);

  const items = useMemo(() => (data?.items ?? []) as DatasetItem[], [data]);

  const { data: settingsData } = useSWR(
    projectId && agentId ? ["live-view-agent-settings-data-tab", projectId, agentId] : null,
    () => liveViewAPI.getAgentSettings(projectId, agentId)
  );
  const savedEvalConfig = useMemo(
    () =>
      ((settingsData as { diagnostic_config?: { eval?: Record<string, unknown> } } | undefined)
        ?.diagnostic_config?.eval ?? {}) as Record<string, unknown>,
    [settingsData]
  );

  const {
    data: detailedSnapshotsData,
    error: detailedSnapshotsError,
    mutate: mutateDetailedSnapshots,
  } = useSWR(
    projectId && agentId ? ["live-view-data-tab-detailed-snapshots", projectId, agentId] : null,
    () => liveViewAPI.listSnapshots(projectId, { agent_id: agentId, limit: 100, offset: 0 }),
    { keepPreviousData: true }
  );
  const detailedSnapshotItems = useMemo(() => {
    const payload = detailedSnapshotsData as
      | { items?: DatasetSnapshotItem[] }
      | DatasetSnapshotItem[]
      | null
      | undefined;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [] as DatasetSnapshotItem[];
  }, [detailedSnapshotsData]);
  const detailedSnapshotMap = useMemo(() => {
    const map = new Map<string, DatasetSnapshotItem>();
    for (const row of detailedSnapshotItems) {
      if (row?.id == null) continue;
      map.set(String(row.id), row);
    }
    return map;
  }, [detailedSnapshotItems]);

  const datasetCount = items.length;
  const datasetLogCount = useMemo(
    () =>
      items.reduce(
        (acc, ds) =>
          acc +
          (typeof ds.snapshot_count === "number"
            ? ds.snapshot_count
            : (ds.snapshot_ids?.length ?? 0)),
        0
      ),
    [items]
  );
  React.useEffect(() => {
    setExpandedDatasetIds(new Set());
  }, [projectId, agentId]);

  const toggleDatasetExpanded = (datasetId: string) => {
    setExpandedDatasetIds(prev => {
      const next = new Set(prev);
      if (next.has(datasetId)) next.delete(datasetId);
      else next.add(datasetId);
      return next;
    });
  };

  const openSnapshotDetail = (snapshotLike: DatasetSnapshotItem) => {
    const snapshotId = String(snapshotLike?.id ?? "");
    if (!snapshotId) return;
    const detailed = detailedSnapshotMap.get(snapshotId);
    const merged = {
      ...snapshotLike,
      ...(detailed || {}),
    } as SnapshotForDetail;
    setDetailSnapshot(merged);
    if (projectId) {
      liveViewAPI
        .getSnapshot(projectId, snapshotId)
        .then((full: Record<string, unknown>) => {
          if (full && String(full.id) === snapshotId) {
            setDetailSnapshot({ ...merged, ...full } as SnapshotForDetail);
          }
        })
        .catch(() => {});
    }
  };

  const detailEvalRows = useMemo(
    () => toEvalRows((detailSnapshot as Record<string, unknown> | null) ?? null),
    [detailSnapshot]
  );

  const handleRemoveLogFromDataset = async (
    datasetId: string,
    snapshotId: string | number,
    options: { currentSnapshots: DatasetSnapshotItem[]; mutateThisDataset: MutateDatasetSnapshots }
  ) => {
    const key = `${datasetId}-${snapshotId}`;
    setRemovingKey(key);
    setDeleteError(null);
    const { currentSnapshots, mutateThisDataset } = options;
    const newSnapshotList = currentSnapshots.filter(s => String(s.id) !== String(snapshotId));
    const removingEntireDataset = newSnapshotList.length === 0;
    const newIds = newSnapshotList
      .map(s => (typeof s.id === "number" ? s.id : parseInt(String(s.id), 10)))
      .filter(n => !Number.isNaN(n));

    mutateThisDataset(
      { items: newSnapshotList, total: newSnapshotList.length },
      { revalidate: false }
    );
    if (removingEntireDataset) {
      setExpandedDatasetIds(prev => {
        const next = new Set(prev);
        next.delete(datasetId);
        return next;
      });
      mutate(
        (prev: { items?: DatasetItem[] } | undefined) =>
          prev?.items ? { ...prev, items: prev.items.filter(d => d.id !== datasetId) } : prev,
        { revalidate: false }
      );
    }

    try {
      if (removingEntireDataset) {
        await behaviorAPI.deleteDataset(projectId, datasetId);
      } else {
        await behaviorAPI.updateDataset(projectId, datasetId, { snapshot_ids: newIds });
      }
      toast.showToast("Saved log deleted.", "success");
    } catch (e: unknown) {
      mutateThisDataset();
      if (removingEntireDataset) mutate();
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to remove log";
      const message = typeof msg === "string" ? msg : "Failed to remove log";
      setDeleteError(message);
      toast.showToast(message, "error");
    } finally {
      setRemovingKey(prev => (prev === key ? null : prev));
    }
  };

  const closeClearAllConfirm = () => {
    setConfirmClearAll(false);
    setDeleteError(null);
  };

  const startRenameDataset = (dataset: DatasetItem) => {
    setEditingDatasetId(dataset.id);
    setRenameDraft(dataset.label?.trim() || "");
  };

  const cancelRenameDataset = () => {
    setEditingDatasetId(null);
    setRenameDraft("");
    setIsRenamingDataset(false);
  };

  const saveDatasetLabel = async (dataset: DatasetItem) => {
    if (!projectId) return;
    const normalized = renameDraft.trim();
    const current = dataset.label?.trim() || "";
    if (normalized === current) {
      cancelRenameDataset();
      return;
    }
    setIsRenamingDataset(true);
    try {
      await behaviorAPI.updateDataset(projectId, dataset.id, { label: normalized });
      await mutate();
      toast.showToast(
        normalized ? `Dataset renamed to "${normalized}".` : "Dataset label cleared.",
        "success"
      );
      cancelRenameDataset();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to rename dataset";
      toast.showToast(typeof msg === "string" ? msg : "Failed to rename dataset", "error");
      setIsRenamingDataset(false);
    }
  };

  const handleConfirmClearAll = async () => {
    if (!projectId || items.length === 0) return;
    const idsToDelete = items.map(ds => ds.id);
    setDeleteError(null);
    closeClearAllConfirm();
    setExpandedDatasetIds(new Set());
    mutate(
      (prev: { items?: DatasetItem[] } | undefined) =>
        prev ? { ...prev, items: [] } : { items: [] },
      { revalidate: false }
    );
    try {
      await behaviorAPI.deleteDatasetsBatch(projectId, idsToDelete);
      await mutate();
      toast.showToast("All saved datasets deleted.", "success");
    } catch (e: unknown) {
      await mutate();
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to clear saved datasets";
      const message = typeof msg === "string" ? msg : "Failed to clear saved datasets";
      toast.showToast(message, "error");
    }
  };

  if (isLoading) {
    return (
      <div
        className="p-10 flex flex-col gap-6 w-full max-w-2xl mx-auto"
        role="status"
        aria-label="Loading datasets"
      >
        <div className="flex items-center gap-3">
          <div className="animate-pulse p-3 rounded-full bg-white/10 w-10 h-10" />
          <div className="flex-1 space-y-2">
            <div className="animate-pulse h-3 rounded bg-white/10 w-32" />
            <div className="animate-pulse h-2 rounded bg-white/5 w-48" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse h-10 rounded-lg bg-white/5 w-full" />
          ))}
        </div>
        <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 sr-only">
          Loading datasets...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-rose-400 font-medium">Failed to load datasets. Please retry.</p>
        <button
          type="button"
          onClick={() => mutate()}
          className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-slate-300 text-sm font-medium hover:bg-white/10 transition-colors"
          aria-label="Retry loading datasets"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-0 flex-1 min-h-0 flex-col overflow-hidden">
      {confirmClearAll && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0f1e] shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Delete all saved datasets
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Delete all saved datasets for this agent? This cannot be undone.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {datasetCount} dataset{datasetCount !== 1 ? "s" : ""} and {datasetLogCount} log
                {datasetLogCount !== 1 ? "s" : ""} will be removed.
              </p>
              {deleteError && (
                <p className="mt-3 text-xs text-rose-400 font-medium">{deleteError}</p>
              )}
            </div>
            <div className="p-4 flex items-center justify-end gap-3 bg-white/[0.02]">
              <button
                type="button"
                onClick={closeClearAllConfirm}
                disabled={isClearingAll}
                className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                disabled={isClearingAll}
                className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300 text-sm font-medium hover:bg-rose-500/30 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isClearingAll ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete all"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Datasets Section */}
      {detailedSnapshotsError && (
        <div className="mx-6 mb-2 px-3 py-2 rounded-lg border border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-3">
          <span className="text-xs text-rose-300">Failed to load snapshot list for details.</span>
          <button
            type="button"
            onClick={() => mutateDetailedSnapshots()}
            className="shrink-0 px-2 py-1 rounded border border-white/20 bg-white/5 text-slate-300 text-xs hover:bg-white/10"
            aria-label="Retry loading snapshot list"
          >
            Retry
          </button>
        </div>
      )}
      <div className="p-8 pb-4 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1 shrink-0">
          <div className="flex items-center gap-3">
            <Database className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-black text-slate-300 uppercase tracking-[0.18em]">
              Saved datasets
            </span>
          </div>
          <p className="text-[11px] text-slate-500 pl-7">
            Node-scoped only. Datasets from other nodes are hidden.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-emerald-400/80 font-black">
            {datasetCount} dataset{datasetCount !== 1 ? "s" : ""} · {datasetLogCount} log
            {datasetLogCount !== 1 ? "s" : ""}
          </span>
          {datasetCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmClearAll(true);
              }}
              disabled={isClearingAll}
              className={clsx(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wide transition-colors",
                "border-rose-500/30 text-rose-300 hover:bg-rose-500/10",
                "disabled:opacity-50 disabled:pointer-events-none"
              )}
              title="Delete all saved datasets"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          )}
        </div>
      </div>
      {deleteError && !confirmClearAll && (
        <p className="px-8 pb-2 text-xs text-rose-400 font-medium">{deleteError}</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-6 pb-20 space-y-3">
        {items.length === 0 && (
          <div className="p-10 text-center space-y-4 border border-dashed border-white/5 rounded-3xl">
            <FileArchive className="w-8 h-8 text-slate-700 mx-auto" />
            <p className="text-xs font-black text-slate-500 uppercase tracking-wide leading-relaxed">
              No datasets saved yet. Select logs in Clinical Log and save into datasets.
            </p>
          </div>
        )}

        {items.map(ds => {
          const label = ds.label?.trim() || `Dataset ${ds.id.slice(0, 8)}`;
          const count =
            typeof ds.snapshot_count === "number"
              ? ds.snapshot_count
              : (ds.snapshot_ids?.length ?? 0);
          const isExpanded = expandedDatasetIds.has(ds.id);
          return (
            <div
              key={ds.id}
              className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden"
            >
              <div className="w-full flex items-center gap-3 p-3 hover:bg-white/[0.03] transition-colors">
                <button
                  type="button"
                  onClick={() => toggleDatasetExpanded(ds.id)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {editingDatasetId === ds.id ? (
                      <input
                        value={renameDraft}
                        onChange={e => setRenameDraft(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveDatasetLabel(ds);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRenameDataset();
                          }
                        }}
                        placeholder="Dataset name"
                        maxLength={200}
                        className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50"
                        autoFocus
                      />
                    ) : (
                      <div className="text-sm text-slate-200 truncate">{label}</div>
                    )}
                    <div
                      className="text-[11px] text-slate-500 mt-0.5"
                      title="Date this selection was saved. Logs inside may be from other dates."
                    >
                      Saved on {formatDate(ds.created_at)}
                      {count > 0 && ` · ${count} log${count !== 1 ? "s" : ""}`}
                    </div>
                  </div>
                </button>
                {editingDatasetId === ds.id ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void saveDatasetLabel(ds)}
                      disabled={isRenamingDataset}
                      className="p-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                      title="Save name"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelRenameDataset}
                      disabled={isRenamingDataset}
                      className="p-1.5 rounded border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-50 transition-colors"
                      title="Cancel rename"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      startRenameDataset(ds);
                    }}
                    className="shrink-0 px-2 py-1 rounded border border-white/10 text-slate-400 hover:text-fuchsia-300 hover:border-fuchsia-500/30 hover:bg-fuchsia-500/10 transition-colors text-xs font-semibold flex items-center gap-1"
                    title="Rename dataset"
                  >
                    <Pencil className="w-3 h-3" />
                    Rename
                  </button>
                )}
              </div>
              <DatasetSnapshotList
                projectId={projectId}
                agentId={agentId}
                dataset={ds}
                isExpanded={isExpanded}
                onOpenDetail={openSnapshotDetail}
                onRemoveLog={handleRemoveLogFromDataset}
                removingKey={removingKey}
                isClearingAll={isClearingAll}
              />
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {detailSnapshot && (
          <SnapshotDetailModal
            snapshot={detailSnapshot}
            onClose={() => setDetailSnapshot(null)}
            evalRows={detailEvalRows}
            evalEnabled={detailEvalRows.length > 0}
            savedEvalConfig={savedEvalConfig}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
