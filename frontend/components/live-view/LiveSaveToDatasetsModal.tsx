"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { XCircle } from "lucide-react";

type DatasetOption = {
  id: string;
  label?: string | null;
  snapshot_count?: number | null;
};

export function LiveSaveToDatasetsModal({
  isOpen,
  isSaving,
  snapshotIdsCount,
  datasets,
  selectedDatasetIds,
  newDatasetName,
  onClose,
  onToggleDataset,
  onDatasetNameChange,
  onSubmit,
}: {
  isOpen: boolean;
  isSaving: boolean;
  snapshotIdsCount: number;
  datasets: DatasetOption[];
  selectedDatasetIds: Set<string>;
  newDatasetName: string;
  onClose: () => void;
  onToggleDataset: (id: string) => void;
  onDatasetNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#050814] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-[0.18em] text-slate-100">
                  Save logs to datasets
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Select existing datasets for this agent or create a new one.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/10 p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
                aria-label="Close"
                disabled={isSaving}
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>

            <div className="custom-scrollbar max-h-[60vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-emerald-300">
                  {snapshotIdsCount} log{snapshotIdsCount !== 1 ? "s" : ""} selected
                </span>
                <span className="text-[11px] text-slate-500">
                  Node-scoped only. Datasets from other nodes are hidden.
                </span>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Existing datasets
                  </span>
                  <span className="text-[11px] text-slate-500">{datasets.length} available</span>
                </div>
                {datasets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 px-3 py-2 text-[11px] text-slate-500">
                    No datasets yet. Create a new dataset below.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {datasets.map(dataset => {
                      const id = String(dataset.id);
                      const label = dataset.label?.trim() || `Dataset ${id.slice(0, 8)}`;
                      const count = typeof dataset.snapshot_count === "number" ? dataset.snapshot_count : 0;
                      const checked = selectedDatasetIds.has(id);

                      return (
                        <label
                          key={id}
                          className={clsx(
                            "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-xs transition-colors",
                            checked
                              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                              : "border-white/10 bg-white/[0.02] text-slate-200 hover:border-white/20 hover:bg-white/5"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border border-white/30 bg-black/40"
                            checked={checked}
                            onChange={() => onToggleDataset(id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{label}</div>
                            <div className="text-[10px] text-slate-400">
                              {count} log{count !== 1 ? "s" : ""}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-white/10 pt-3">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Create new dataset
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newDatasetName}
                    onChange={event => onDatasetNameChange(event.target.value)}
                    placeholder="Dataset name (optional)"
                    maxLength={200}
                    className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-fuchsia-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  If you enter a name, a new dataset will be created and these logs will be included.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 bg-black/40 px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-lg border border-white/15 px-4 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSaving}
                className="flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-300 border-t-transparent" />
                ) : null}
                {isSaving ? "Saving..." : "Save to datasets"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
