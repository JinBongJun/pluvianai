"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Check, CheckSquare, Square } from "lucide-react";

type DatasetSummary = {
  id: string;
  label?: string;
  agent_id?: string;
  created_at?: string;
};

type DatasetPickerModalProps = {
  open: boolean;
  onClose: () => void;
  datasets: DatasetSummary[];
  loading: boolean;
  selectedIds?: string[];
  onSelect: (datasetIds: string[]) => void;
};

export function DatasetPickerModal({
  open,
  onClose,
  datasets,
  loading,
  selectedIds = [],
  onSelect,
}: DatasetPickerModalProps) {
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set(selectedIds));

  useEffect(() => {
    if (open) {
      setTempSelected(new Set(selectedIds));
    }
  }, [open, selectedIds]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const toggleSelection = (id: string) => {
    const next = new Set(tempSelected);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setTempSelected(next);
  };

  const handleSelectAll = () => {
    if (tempSelected.size === datasets.length) {
      setTempSelected(new Set());
    } else {
      setTempSelected(new Set(datasets.map(d => d.id)));
    }
  };

  const handleConfirm = () => {
    onSelect(Array.from(tempSelected));
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dataset-picker-title"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#111216] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 id="dataset-picker-title" className="text-base font-bold text-white">
            Select datasets
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02] shrink-0">
          <span className="text-xs text-slate-400 font-medium">{tempSelected.size} selected</span>
          <button
            type="button"
            onClick={handleSelectAll}
            className="text-xs font-medium text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
          >
            {tempSelected.size === datasets.length ? "Deselect All" : "Select All"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-slate-500" aria-hidden="true" />
            </div>
          ) : datasets.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              No datasets for this agent yet.
            </p>
          ) : (
            datasets.map(dataset => {
              const isSelected = tempSelected.has(dataset.id);
              return (
                <button
                  key={dataset.id}
                  type="button"
                  role="checkbox"
                  aria-label={`Select dataset ${dataset.label || dataset.id}`}
                  aria-checked={isSelected}
                  onClick={() => toggleSelection(dataset.id)}
                  className={`w-full text-left rounded-xl border px-4 py-3 transition-all flex items-start gap-3 ${
                    isSelected
                      ? "border-fuchsia-500/60 bg-fuchsia-500/10"
                      : "border-white/10 bg-white/[0.02] hover:border-white/30 hover:bg-white/5"
                  }`}
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
                        <span title="Date this selection was saved.">
                          Saved on: {new Date(dataset.created_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="p-5 border-t border-white/10 shrink-0 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2 rounded-lg text-sm font-bold text-white bg-fuchsia-600 hover:bg-fuchsia-500 shadow-lg shadow-fuchsia-900/20 transition-all"
          >
            Confirm ({tempSelected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
