"use client";

import Link from "next/link";
import clsx from "clsx";
import { CheckSquare, ChevronDown, Square } from "lucide-react";

import type { SurfaceStatus } from "@/components/live-view/liveIssuePresentation";

type Badge = { label: string; title: string };

export function LiveIssueRow({
  id,
  isExpanded,
  isSelectMode,
  isRemoveMode,
  isSelected,
  isRemoveSelected,
  issueTitle,
  fullTime,
  modelLabel,
  casePreview,
  surfaceStatus,
  toolDefinitionCount,
  captureStateBadge,
  requestShapeBadges,
  failedCount,
  passedCount,
  actionHref,
  actionLabel,
  onToggleRow,
}: {
  id: string | number;
  isExpanded: boolean;
  isSelectMode: boolean;
  isRemoveMode: boolean;
  isSelected: boolean;
  isRemoveSelected: boolean;
  issueTitle: string;
  fullTime: string;
  modelLabel: string;
  casePreview: string;
  surfaceStatus: SurfaceStatus;
  toolDefinitionCount: number;
  captureStateBadge: Badge | null;
  requestShapeBadges: Badge[];
  failedCount: number;
  passedCount: number;
  actionHref: string | null;
  actionLabel: string;
  onToggleRow: () => void;
}) {
  return (
    <div
      key={id}
      className={clsx(
        "group overflow-hidden border-b border-white/[0.04] transition-colors duration-200",
        isExpanded
          ? clsx(
              "bg-white/[0.02]",
              failedCount > 0
                ? "border-l-[2px] border-l-rose-500/40"
                : passedCount > 0
                  ? "border-l-[2px] border-l-emerald-500/40"
                  : "border-l-[2px] border-l-emerald-500/20"
            )
          : clsx(
              "border-l-[2px] border-l-transparent",
              failedCount > 0
                ? "bg-rose-500/[0.03] hover:bg-rose-500/[0.06]"
                : passedCount > 0
                  ? "bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05]"
                  : "hover:bg-white/[0.03]"
            )
      )}
    >
      <button
        type="button"
        onClick={onToggleRow}
        aria-expanded={!isSelectMode && !isRemoveMode ? isExpanded : undefined}
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
            <div className="flex w-[14rem] min-w-0 shrink-0 flex-col">
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    "h-2 w-2 shrink-0 rounded-full",
                    surfaceStatus.tone === "attention"
                      ? "bg-rose-500/80 shadow-[0_0_8px_rgba(244,63,94,0.3)]"
                      : "bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                  )}
                />
                <span className="truncate text-[13px] font-semibold text-slate-100">{issueTitle}</span>
              </div>
              <div className="mt-1 truncate text-[11px] tabular-nums text-slate-500" title={fullTime}>
                {fullTime} · {modelLabel}
              </div>
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-slate-300">{casePreview}</p>
            <div className="mt-1 flex items-center gap-2 truncate text-[11px] text-slate-500">
              <span>{surfaceStatus.reason}</span>
              {toolDefinitionCount > 0 ? <span>· Tools configured</span> : null}
              {captureStateBadge ? <span title={captureStateBadge.title}>· {captureStateBadge.label}</span> : null}
              {requestShapeBadges.slice(0, 1).map(badge => (
                <span key={badge.label} title={badge.title}>
                  · {badge.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <div className="w-[13rem] shrink-0">
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

          {actionHref ? (
            <Link
              href={actionHref}
              onClick={event => event.stopPropagation()}
              className="inline-flex items-center rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1.5 text-sm font-medium text-fuchsia-200 hover:bg-fuchsia-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onToggleRow();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
            >
              {actionLabel}
              <ChevronDown
                className={clsx("h-3.5 w-3.5 transition-transform duration-300", isExpanded && "rotate-180")}
              />
            </button>
          )}
        </div>
      </button>
    </div>
  );
}
