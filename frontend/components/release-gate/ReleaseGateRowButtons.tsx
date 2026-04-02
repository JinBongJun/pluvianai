"use client";

import React from "react";
import clsx from "clsx";
import { Activity, X } from "lucide-react";
import {
  shortText,
  summarizeGroundingForCase,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";
import type { ReleaseGateHistoryItem } from "@/lib/api/types";

export function ResultCaseRowButton({
  run,
  idx,
  repeatRunsFallback,
  baselineSnapshotForRun,
  onSelect,
  onDismissLatest,
  testId,
}: {
  run: any;
  idx: number;
  repeatRunsFallback: unknown;
  baselineSnapshotForRun: Record<string, unknown> | null;
  onSelect: (payload: {
    attempts: any[];
    caseIndex: number;
    baselineSnapshot: Record<string, unknown> | null;
  }) => void;
  onDismissLatest?: () => void;
  testId: string;
}) {
  const attempts = Array.isArray(run?.attempts) ? run.attempts : [];
  const caseStatusRaw = String(run?.case_status ?? (run?.pass ? "pass" : "fail"))
    .trim()
    .toLowerCase();
  const caseIsPass =
    caseStatusRaw === "pass" ||
    (caseStatusRaw !== "fail" && caseStatusRaw !== "flaky" && Boolean(run?.pass));
  const caseIsFlaky = caseStatusRaw === "flaky";
  const totalAttempts = attempts.length || Number(repeatRunsFallback) || 1;
  const passRatioFallback = Number((run?.summary as any)?.pass_ratio);
  const passedAttempts = attempts.length
    ? attempts.filter((attempt: any) => Boolean(attempt?.pass)).length
    : Number.isFinite(passRatioFallback)
      ? Math.max(0, Math.min(totalAttempts, Math.round(passRatioFallback * totalAttempts)))
      : caseIsPass
        ? totalAttempts
        : 0;
  const caseStatusLabel = caseIsPass ? "Healthy" : caseIsFlaky ? "Flaky" : "Flagged";
  const baselineInputPreview = String(
    baselineSnapshotForRun?.user_message ?? baselineSnapshotForRun?.request_prompt ?? ""
  ).trim();
  const caseGrounding = summarizeGroundingForCase(run);
  const attemptSummaryLabel = `${passedAttempts}/${totalAttempts} healthy`;
  const handleOpenDetails = () => {
    if (attempts.length > 0) {
      onSelect({
        attempts,
        caseIndex: idx,
        baselineSnapshot: baselineSnapshotForRun,
      });
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleOpenDetails}
      onKeyDown={event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenDetails();
        }
      }}
      data-testid={testId}
      className={clsx(
        "group flex w-full cursor-pointer flex-col gap-2.5 rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-white/15",
        caseIsPass
          ? "border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/40 hover:bg-emerald-500/[0.08]"
          : caseIsFlaky
            ? "border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50 hover:bg-amber-500/[0.1]"
            : "border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-500/50 hover:bg-rose-500/[0.1]"
      )}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              caseIsPass
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                : caseIsFlaky
                  ? "border-amber-500/30 bg-amber-500/20 text-amber-200"
                  : "border-rose-500/30 bg-rose-500/20 text-rose-300"
            )}
          >
            {caseStatusLabel}
          </span>
          <span className="text-sm font-semibold text-slate-100">Input {idx + 1}</span>
        </div>
        <div className="flex shrink-0 items-center">
          {onDismissLatest ? (
            <button
              type="button"
              onClick={event => {
                event.stopPropagation();
                onDismissLatest();
              }}
              onKeyDown={event => {
                event.stopPropagation();
              }}
              className="rounded-md border border-white/10 bg-black/20 p-1 text-white/45 transition hover:text-white"
              title="Hide latest result"
              aria-label="Hide latest result"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 flex-1 w-full space-y-2.5 mt-1">
        {baselineInputPreview && (
          <div className="truncate text-[12px] text-slate-400 bg-black/20 border border-white/5 rounded-lg px-2.5 py-1.5">
            {baselineInputPreview}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={clsx(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              passedAttempts === totalAttempts
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/20 bg-rose-500/10 text-rose-200"
            )}
          >
            {attemptSummaryLabel}
          </span>
          {caseGrounding.rollup && caseGrounding.rollup !== "na" ? (
            <span
              className={clsx(
                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                caseGrounding.rollup === "pass"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-300"
              )}
            >
              Grounding {caseGrounding.rollup === "pass" ? "Healthy" : "Flagged"}
            </span>
          ) : null}
          {caseGrounding.semantic === "pass" ? (
            <span className="rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
              Semantic OK
            </span>
          ) : null}
          {caseGrounding.semantic === "unavailable" ? (
            <span
              className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
              title="Semantic judge did not run (e.g. no OpenAI key configured)."
            >
              Semantic off
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** History list row — same layout language as Results “Per-input breakdown” rows. */
export function HistoryRunRowButton({
  item,
  selected,
  loading,
  onClick,
  testId,
}: {
  item: ReleaseGateHistoryItem;
  selected: boolean;
  loading?: boolean;
  onClick: () => void;
  testId: string;
}) {
  const rawStatus = String(item.status ?? "")
    .trim()
    .toLowerCase();
  const caseIsPass = rawStatus === "pass";
  const caseIsFlaky = rawStatus === "flaky";
  const caseStatusLabel = caseIsPass ? "Healthy" : caseIsFlaky ? "Flaky" : "Flagged";
  const repeatRuns = Number(item.repeat_runs ?? item.session_repeat_runs ?? 0);
  const totalAttempts = Math.max(0, Number(item.total_attempts ?? 0)) || repeatRuns || 1;
  const passedAttempts =
    item.passed_attempts != null
      ? Math.max(0, Math.min(totalAttempts, Number(item.passed_attempts)))
      : caseIsPass
        ? totalAttempts
        : 0;
  const rawInputPreview = String(item.input_preview ?? "").trim();
  const preview = rawInputPreview ? shortText(rawInputPreview, "", 96) : "";
  const inputIndexNumber =
    Number.isFinite(Number(item.input_index)) && Number(item.input_index) > 0
      ? Number(item.input_index)
      : Number(item.case_index ?? 0) + 1;
  const inputLabel = String(item.input_label || `Input ${inputIndexNumber}`);
  const tracePreview = item.trace_id ? shortText(String(item.trace_id), "", 48) : "";
  const attemptSummaryLabel = `${passedAttempts}/${totalAttempts} healthy`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      data-testid={testId}
      data-run-status={String(item.status || "").toLowerCase()}
      className={clsx(
        "group w-full rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg flex flex-col gap-3",
        loading && "opacity-80",
        selected
          ? "border-fuchsia-500/50 bg-fuchsia-500/10 shadow-[0_0_15px_rgba(217,70,239,0.1)]"
          : caseIsPass
            ? "border-emerald-500/20 bg-emerald-500/[0.03] hover:border-emerald-500/40 hover:bg-emerald-500/[0.08]"
            : caseIsFlaky
              ? "border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50 hover:bg-amber-500/[0.1]"
              : "border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-500/50 hover:bg-rose-500/[0.1]"
      )}
    >
      <div className="flex items-start justify-between gap-3 w-full">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={clsx(
              "shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              caseIsPass
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                : caseIsFlaky
                  ? "border-amber-500/30 bg-amber-500/20 text-amber-200"
                  : "border-rose-500/30 bg-rose-500/20 text-rose-300"
            )}
          >
            {caseStatusLabel}
          </span>
          <span className="text-sm font-semibold text-slate-100">
            {inputLabel}
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          {loading ? (
            <Activity className="h-4 w-4 animate-spin text-slate-400" aria-hidden />
          ) : (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 opacity-60 transition-all group-hover:text-white group-hover:opacity-100">
              <span>{selected ? "Opening..." : "View details"}</span>
              <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2.5 w-full">
        {preview ? (
          <div
            className="max-w-full rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5"
            title={rawInputPreview}
          >
            <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/35">
              Input preview
            </div>
            <div className="truncate text-[12px] text-slate-300">{preview}</div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={clsx(
              "rounded-full border px-2.5 py-1 font-medium",
              passedAttempts === totalAttempts
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/20 bg-rose-500/10 text-rose-200"
            )}
          >
            {attemptSummaryLabel}
          </span>
          {repeatRuns > 0 ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-medium text-slate-300">
              <strong className="text-slate-100">{repeatRuns}x</strong> each
            </span>
          ) : null}
          {item.session_total_inputs && item.session_total_inputs > 1 ? (
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 font-medium text-slate-400">
              {item.session_total_inputs} inputs in session
            </span>
          ) : null}
        </div>
        {tracePreview ? (
          <div
            className="max-w-full self-start rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5 font-mono text-xs text-slate-500"
            title={item.trace_id ? String(item.trace_id) : undefined}
          >
            <div className="mb-0.5 text-[9px] font-sans font-semibold uppercase tracking-wider text-white/35">
              Trace
            </div>
            <div className="truncate">{tracePreview}</div>
          </div>
        ) : null}
      </div>
    </button>
  );
}
