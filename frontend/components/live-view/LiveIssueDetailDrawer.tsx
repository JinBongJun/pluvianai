"use client";

import Link from "next/link";
import clsx from "clsx";

import {
  RequestContextPanel,
  type RequestContextSnapshot,
} from "@/components/live-view/RequestContextPanel";
import { getEvalCheckLabel } from "@/lib/evalPresentation";
import { buildSurfaceStatus, type SurfaceStatus } from "@/components/live-view/liveIssuePresentation";

type EvalRowLike = {
  id: string;
  status: string;
};

type SnapshotLike = {
  id: string;
  created_at: string;
  request_prompt?: string | null;
  user_message?: string | null;
  has_tool_results?: boolean;
  latency_ms?: number | null;
  model: string;
};

export function LiveIssueDetailDrawer({
  snapshot,
  detailSnapshot,
  issueTitle,
  toolDefinitionCount,
  evalRows,
  releaseGateHref,
  formatPrettyTime,
  onClose,
  onOpenFullDetails,
}: {
  snapshot: SnapshotLike;
  detailSnapshot: RequestContextSnapshot | null;
  issueTitle: string;
  toolDefinitionCount: number;
  evalRows: EvalRowLike[];
  releaseGateHref?: string;
  formatPrettyTime: (value?: string) => string;
  onClose: () => void;
  onOpenFullDetails: () => void;
}) {
  const failedCount = evalRows.filter(row => row.status === "fail").length;
  const passedCount = evalRows.filter(row => row.status === "pass").length;
  const surfaceStatus: SurfaceStatus = buildSurfaceStatus({
    failedCount,
    passedCount,
    evalRowsCount: evalRows.length,
    hasToolDefinitions: toolDefinitionCount > 0,
    hasToolResults: Boolean(snapshot.has_tool_results),
  });

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="live-issue-drawer-title"
      className="flex h-full w-[min(560px,calc(100%-3rem))] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0f1014]/98 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">Selected issue</p>
          <h2 id="live-issue-drawer-title" className="mt-1 truncate text-lg font-semibold text-white">
            {issueTitle}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{formatPrettyTime(snapshot.created_at)}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close issue details"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
        >
          Close
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 custom-scrollbar">
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-slate-500">Case</h3>
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200">
            {snapshot.request_prompt || snapshot.user_message || "No request text captured."}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Status</p>
            <p
              className={clsx(
                "mt-2 text-sm font-semibold",
                surfaceStatus.tone === "attention" ? "text-rose-200" : "text-emerald-200"
              )}
            >
              {surfaceStatus.label}
            </p>
            <p className="mt-1 text-sm text-slate-400">{surfaceStatus.reason}</p>
          </div>
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3">
            <p className="text-xs font-medium text-slate-500">Runtime</p>
            <p className="mt-2 text-sm font-semibold text-white tabular-nums">
              {snapshot.latency_ms != null ? `${snapshot.latency_ms}ms` : "Unknown"}
            </p>
            <p className="mt-1 text-sm text-slate-400 break-all">{snapshot.model}</p>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-medium text-slate-500">Checks</h3>
          <div className="space-y-2">
            {evalRows.length > 0 ? (
              evalRows.map(row => (
                <div
                  key={`${snapshot.id}-${row.id}`}
                  className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2 text-sm"
                >
                  <span className="text-slate-200">{getEvalCheckLabel(row.id, row.id)}</span>
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      row.status === "fail"
                        ? "bg-rose-500/15 text-rose-200"
                        : row.status === "pass"
                          ? "bg-emerald-500/15 text-emerald-200"
                          : "bg-white/10 text-slate-300"
                    )}
                  >
                    {row.status}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-slate-500">
                No stored checks for this issue yet.
              </div>
            )}
          </div>
        </section>

        {detailSnapshot ? (
          <section className="space-y-2">
            <h3 className="text-xs font-medium text-slate-500">Request context</h3>
            <div className="rounded-2xl border border-white/6 bg-[#0a0b0f] p-4">
              <RequestContextPanel snapshot={detailSnapshot} />
            </div>
          </section>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-4">
        <p className="text-sm text-slate-500">Use Release Gate when this case needs a controlled rerun.</p>
        <div className="flex items-center gap-2">
          {releaseGateHref ? (
            <Link
              href={releaseGateHref}
              className="rounded-lg border border-fuchsia-500/25 bg-fuchsia-500/10 px-3 py-1.5 text-sm font-medium text-fuchsia-200 transition-colors hover:bg-fuchsia-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/70"
            >
              Open in Gate
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onOpenFullDetails}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
          >
            Full details
          </button>
        </div>
      </div>
    </aside>
  );
}
