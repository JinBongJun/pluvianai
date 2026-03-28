"use client";

import Link from "next/link";
import clsx from "clsx";

import { computeAccountUsageMetrics, formatUsageLimit } from "@/lib/accountUsage";
import { useAccountUsage } from "@/hooks/useAccountUsage";

/** Compact snapshot quota next to the Live View agent panel title (same data as Settings → Usage). */
export function LiveViewPanelSnapshotUsage() {
  const { data, isLoading } = useAccountUsage();
  const metrics = computeAccountUsageMetrics(data);

  if (isLoading && !metrics) {
    return <div className="h-6 w-28 animate-pulse rounded-md bg-white/10" />;
  }
  if (!metrics) return null;

  return (
    <div
      className={clsx(
        "max-w-[min(240px,40vw)] rounded-lg border px-2 py-1 text-[10px] font-mono leading-tight text-slate-300",
        metrics.snapshotsExhausted
          ? "border-amber-500/40 bg-amber-500/10"
          : metrics.snapshotsNearLimit
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-white/10 bg-black/20"
      )}
    >
      <span className="text-slate-500">Snapshots </span>
      <span className="text-slate-100">
        {metrics.snapshotsUsed}/{formatUsageLimit(metrics.snapshotsLimit)}
      </span>
      {metrics.snapshotsExhausted ? (
        <Link
          href="/settings/billing"
          className="ml-1.5 text-[9px] font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
        >
          Billing
        </Link>
      ) : null}
    </div>
  );
}
