"use client";

import clsx from "clsx";
import { CheckSquare, Square } from "lucide-react";

import type { SurfaceStatus } from "@/components/live-view/liveIssuePresentation";

type Badge = { label: string; title: string };

export function LiveIssueRow({
  id,
  isSelectMode,
  isRemoveMode,
  isSelected,
  isRemoveSelected,
  fullTime,
  modelLabel,
  casePreview,
  surfaceStatus,
  toolDefinitionCount,
  captureStateBadge,
  failedCount,
  passedCount,
  onToggleRow,
}: {
  id: string | number;
  isSelectMode: boolean;
  isRemoveMode: boolean;
  isSelected: boolean;
  isRemoveSelected: boolean;
  fullTime: string;
  modelLabel: string;
  casePreview: string;
  surfaceStatus: SurfaceStatus;
  toolDefinitionCount: number;
  captureStateBadge: Badge | null;
  failedCount: number;
  passedCount: number;
  onToggleRow: () => void;
}) {
  const secondaryHint = captureStateBadge?.label || (toolDefinitionCount > 0 ? "Tool setup required" : null);

  return (
    <div
      key={id}
      className={clsx(
        "group overflow-hidden border-b border-white/[0.04] transition-colors duration-200",
        failedCount > 0
          ? "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
          : passedCount > 0
            ? "bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05]"
            : "hover:bg-white/[0.03]"
      )}
    >
      <button
        type="button"
        onClick={onToggleRow}
        className="flex w-full cursor-pointer items-center justify-between px-6 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-4 pr-4">
          {isSelectMode ? (
            <div className="flex w-8 shrink-0 flex-col items-center justify-center">
              {isSelected ? (
                <CheckSquare className="h-4 w-4 text-emerald-400" />
              ) : (
                <Square className="h-4 w-4 text-slate-600 transition-colors group-hover:text-slate-400" />
              )}
            </div>
          ) : isRemoveMode ? (
            <div className="flex w-8 shrink-0 flex-col items-center justify-center">
              {isRemoveSelected ? (
                <CheckSquare className="h-4 w-4 text-rose-400" />
              ) : (
                <Square className="h-4 w-4 text-slate-600 transition-colors group-hover:text-rose-400" />
              )}
            </div>
          ) : (
            <div
              className={clsx(
                "mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full",
                surfaceStatus.tone === "attention"
                  ? "bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                  : "bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
              )}
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-slate-200">{casePreview}</p>
            <div className="mt-1 truncate text-[11px] tabular-nums text-slate-500">
              {fullTime} · {modelLabel}
            </div>
            {secondaryHint ? (
              <div className="mt-1 truncate text-[11px] text-slate-500" title={captureStateBadge?.title}>
                {secondaryHint}
              </div>
            ) : null}
          </div>
        </div>

        <div className="w-[11rem] shrink-0">
          <div
            className={clsx(
              "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold",
              surfaceStatus.tone === "attention"
                ? "border-rose-500/25 bg-rose-500/10 text-rose-200"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
            )}
          >
            {surfaceStatus.label}
          </div>
          <div className="mt-1 truncate text-[11px] tabular-nums text-slate-500">
            {surfaceStatus.reason}
          </div>
        </div>
      </button>
    </div>
  );
}
