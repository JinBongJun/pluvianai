"use client";

import Link from "next/link";
import clsx from "clsx";

import type { SnapshotRiskSummary } from "@/lib/snapshotRiskSummary";

export function SnapshotRiskHero({
  summary,
  releaseGateHref,
}: {
  summary: SnapshotRiskSummary;
  releaseGateHref?: string | null;
}) {
  const isSafe = summary.level === "safe";

  return (
    <div
      className={clsx(
        "mb-10 rounded-[24px] border p-6 shadow-inner",
        isSafe
          ? "border-emerald-500/15 bg-emerald-950/10"
          : summary.level === "unsafe"
            ? "border-rose-500/20 bg-rose-950/10"
            : "border-amber-500/20 bg-amber-950/10"
      )}
    >
      <div className={clsx("grid gap-4", isSafe ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]")}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={clsx(
                "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                isSafe
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : summary.level === "unsafe"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-200"
              )}
            >
              {isSafe
                ? "Safe"
                : summary.level === "unsafe"
                  ? "Unsafe"
                  : "Needs Review"}
            </span>
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
              Primary risk: {summary.categoryLabel}
            </span>
          </div>

          <div>
            <h4 className="text-2xl font-semibold text-white text-balance">{summary.headline}</h4>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{summary.impact}</p>
          </div>

          <div className="rounded-2xl border border-white/8 bg-black/20 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Failed checks
            </div>
            <div className="mt-2 text-sm text-slate-200">
              {summary.failedCheckLabels.length > 0
                ? summary.failedCheckLabels.join(", ")
                : "No failed checks"}
            </div>
          </div>
        </div>

        {isSafe ? (
          <div className="rounded-[20px] border border-emerald-500/10 bg-black/20 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              No action needed
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Current checks passed for this snapshot. Open Release Gate only if you want to compare a new candidate before shipping.
            </p>
          </div>
        ) : (
          <div className="rounded-[20px] border border-white/8 bg-black/20 p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Recommended next step
            </div>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Replay this exact production snapshot with a candidate prompt, model, or tool setup before shipping.
            </p>
            {releaseGateHref ? (
              <Link
                href={releaseGateHref}
                className="mt-5 inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/15"
              >
                Test a Fix in Release Gate
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
