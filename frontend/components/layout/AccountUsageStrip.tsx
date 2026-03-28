"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

import { computeAccountUsageMetrics, formatUsageLimit } from "@/lib/accountUsage";
import { useAccountUsage } from "@/hooks/useAccountUsage";

/**
 * Next to Live View / Release Gate toggles: monthly snapshot and hosted replay usage (same source as Settings → Usage).
 */
export function AccountUsageStrip() {
  const pathname = usePathname();
  const { data, isLoading } = useAccountUsage();

  const isLiveView = typeof pathname === "string" && pathname.includes("/live-view");
  const isReleaseGate = typeof pathname === "string" && pathname.includes("/release-gate");
  if (!isLiveView && !isReleaseGate) return null;

  const metrics = computeAccountUsageMetrics(data);

  if (isLoading && !metrics) {
    return (
      <div className="h-9 min-w-[160px] max-w-[min(100vw-2rem,420px)] animate-pulse rounded-2xl border border-white/[0.06] bg-black/30" />
    );
  }
  if (!metrics) return null;

  const snapAlert = isLiveView && metrics.snapshotsExhausted;
  const replayAlert = isReleaseGate && metrics.replayExhausted;
  const snapWarn = isLiveView && !metrics.snapshotsExhausted && metrics.snapshotsNearLimit;
  const replayWarn = isReleaseGate && !metrics.replayExhausted && metrics.replayNearLimit;

  return (
    <div
      className={clsx(
        "flex max-w-[min(100vw-2rem,520px)] flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 backdrop-blur-md",
        snapAlert || replayAlert
          ? "border-amber-500/40 bg-amber-500/[0.12]"
          : snapWarn || replayWarn
            ? "border-amber-500/25 bg-amber-500/[0.06]"
            : "border-white/[0.08] bg-black/35"
      )}
    >
      {isLiveView && (
        <span className="font-mono normal-case tracking-normal text-slate-300">
          Snapshots{" "}
          <span className="text-slate-100">
            {metrics.snapshotsUsed}/{formatUsageLimit(metrics.snapshotsLimit)}
          </span>
          {snapAlert ? (
            <Link
              href="/settings/billing"
              className="ml-2 text-[10px] font-bold normal-case tracking-normal text-amber-200 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-100"
            >
              Limit reached — Billing
            </Link>
          ) : null}
        </span>
      )}
      {isReleaseGate && (
        <span className="font-mono normal-case tracking-normal text-slate-300">
          Hosted replays{" "}
          <span className="text-slate-100">
            {metrics.replayUsed}/{formatUsageLimit(metrics.replayLimit)}
          </span>
          {replayAlert ? (
            <Link
              href="/settings/billing"
              className="ml-2 text-[10px] font-bold normal-case tracking-normal text-amber-200 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-100"
            >
              Limit reached — Billing
            </Link>
          ) : null}
        </span>
      )}
    </div>
  );
}
