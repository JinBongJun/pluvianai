"use client";

import { useContext } from "react";
import Link from "next/link";
import clsx from "clsx";

import { ReleaseGatePageContext } from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/ReleaseGatePageContext";
import { computeAccountUsageMetrics, formatUsageLimit } from "@/lib/accountUsage";
import { useAccountUsage } from "@/hooks/useAccountUsage";

/** Hosted replay credits next to the modal title — only when candidate uses Pluvian hosted models. */
export function ReleaseGateConfigHostedReplayUsage() {
  const ctx = useContext(ReleaseGatePageContext);
  const modelSource = ctx?.modelSource;
  const { data, isLoading } = useAccountUsage(modelSource === "hosted");
  const metrics = computeAccountUsageMetrics(data);

  if (modelSource !== "hosted") return null;
  if (isLoading && !metrics) {
    return <div className="h-7 w-36 animate-pulse rounded-lg bg-white/10" />;
  }
  if (!metrics) return null;

  return (
    <div
      className={clsx(
        "shrink-0 rounded-xl border px-3 py-2 text-right",
        metrics.replayExhausted
          ? "border-amber-500/40 bg-amber-500/10"
          : metrics.replayNearLimit
            ? "border-amber-500/25 bg-amber-500/5"
            : "border-white/10 bg-white/[0.03]"
      )}
    >
      <div className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
        Hosted replays (this month)
      </div>
      <div className="mt-0.5 font-mono text-xs text-slate-200">
        {metrics.replayUsed}/{formatUsageLimit(metrics.replayLimit)}
        {metrics.replayExhausted ? (
          <Link
            href="/settings/billing"
            className="ml-2 text-[10px] font-semibold text-amber-300 underline underline-offset-2 hover:text-amber-200"
          >
            Billing
          </Link>
        ) : null}
      </div>
    </div>
  );
}
