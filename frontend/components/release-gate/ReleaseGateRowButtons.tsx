"use client";

import React from "react";
import clsx from "clsx";
import { Activity } from "lucide-react";
import {
  formatDateTime,
  shortText,
  summarizeGroundingForCase,
} from "@/app/organizations/[orgId]/projects/[projectId]/release-gate/releaseGateExpandedHelpers";

export function ResultCaseRowButton({
  run,
  idx,
  repeatRunsFallback,
  baselineSnapshotForRun,
  onSelect,
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
  const caseStatusLabel = caseIsPass ? "Passed" : caseIsFlaky ? "Flaky" : "Failed";
  const baselineInputPreview = String(
    baselineSnapshotForRun?.user_message ?? baselineSnapshotForRun?.request_prompt ?? ""
  ).trim();
  const caseGrounding = summarizeGroundingForCase(run);
  const attemptSummaryLabel = `${passedAttempts}/${totalAttempts} passed`;

  return (
    <button
      type="button"
      onClick={() => {
        if (attempts.length > 0) {
          onSelect({
            attempts,
            caseIndex: idx,
            baselineSnapshot: baselineSnapshotForRun,
          });
        }
      }}
      data-testid={testId}
      className={clsx(
        "group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
        caseIsPass
          ? "border-emerald-500/10 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.06]"
          : caseIsFlaky
            ? "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
            : "border-rose-500/15 bg-rose-500/[0.03] hover:bg-rose-500/10"
      )}
    >
      <span
        className={clsx(
          "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
          caseIsPass
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : caseIsFlaky
              ? "border-amber-500/20 bg-amber-500/15 text-amber-200"
              : "border-rose-500/20 bg-rose-500/10 text-rose-300"
        )}
      >
        {caseStatusLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="shrink-0 text-sm font-semibold text-slate-100">Input {idx + 1}</span>
          {baselineInputPreview && (
            <span className="truncate text-[12px] text-slate-400">{baselineInputPreview}</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
              Grounding {caseGrounding.rollup === "pass" ? "Passed" : "Failed"}
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
      <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1 text-right">
        <span className="text-[10px] text-slate-500">Open attempt</span>
        <span className="text-[11px] font-medium text-slate-400 opacity-60 transition-opacity group-hover:opacity-100">
          View details &rarr;
        </span>
      </div>
    </button>
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
  item: {
    id: string;
    status?: string;
    trace_id?: string | null;
    created_at?: string | null;
    repeat_runs?: number | null;
    total_inputs?: number | null;
    passed_runs?: number | null;
    failed_runs?: number | null;
  };
  selected: boolean;
  loading?: boolean;
  onClick: () => void;
  testId: string;
}) {
  const rawStatus = String(item.status ?? "").trim().toLowerCase();
  const caseIsPass = rawStatus === "pass";
  const caseIsFlaky = rawStatus === "flaky";
  const caseStatusLabel = caseIsPass ? "Healthy" : caseIsFlaky ? "Flaky" : "Flagged";
  const passedInputs = Number(item.passed_runs ?? 0);
  const failedInputs = Number(item.failed_runs ?? 0);
  const explicitInputTotal = Number(item.total_inputs ?? 0);
  const inputTotal = passedInputs + failedInputs || explicitInputTotal;
  const repeatRuns = Number(item.repeat_runs ?? 0);
  const hasExplicitPassSummary = passedInputs + failedInputs > 0;
  const inputSummary = hasExplicitPassSummary ? `${passedInputs}/${inputTotal} healthy` : null;
  const inputCountLabel =
    inputTotal > 0 ? `${inputTotal} input${inputTotal === 1 ? "" : "s"}` : "Run details limited";
  const preview = item.trace_id ? shortText(String(item.trace_id), "", 48) : "";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      data-testid={testId}
      data-run-status={String(item.status || "").toLowerCase()}
      className={clsx(
        "group w-full rounded-2xl border px-3 py-3 text-left transition",
        loading && "opacity-80",
        selected
          ? "border-fuchsia-500/30 bg-fuchsia-500/10"
          : caseIsPass
            ? "border-emerald-500/10 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.06]"
            : caseIsFlaky
              ? "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
              : "border-rose-500/15 bg-rose-500/[0.03] hover:bg-rose-500/10"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={clsx(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                caseIsPass
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                  : caseIsFlaky
                    ? "border-amber-500/20 bg-amber-500/15 text-amber-200"
                    : "border-rose-500/20 bg-rose-500/10 text-rose-300"
              )}
            >
              {caseStatusLabel}
            </span>
            <span
              className={clsx(
                "text-sm font-semibold",
                inputTotal > 0 ? "text-slate-100" : "text-slate-400"
              )}
            >
              {inputCountLabel}
            </span>
            {inputSummary ? (
              <span
                className={clsx(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                  caseIsPass
                    ? "border-emerald-500/15 bg-emerald-500/10 text-emerald-200"
                    : caseIsFlaky
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-200"
                      : "border-rose-500/20 bg-rose-500/10 text-rose-200"
                )}
              >
                {inputSummary}
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {repeatRuns > 0 ? (
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                {repeatRuns}x each
              </span>
            ) : null}
            {!inputSummary && inputTotal <= 0 ? (
              <span className="text-[10px] text-slate-500">Legacy run: input breakdown unavailable</span>
            ) : null}
          </div>
          <div className="mt-2 flex min-w-0 items-center gap-2 text-[11px] text-slate-500">
            <span className="shrink-0 whitespace-nowrap">{formatDateTime(item.created_at)}</span>
            {preview ? (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-white/10" />
                <span className="min-w-0 truncate">{preview}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1 text-right">
          {loading ? (
            <Activity className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden />
          ) : (
            <>
              <span className="text-[10px] text-slate-500">{selected ? "Opening run" : "Open run"}</span>
              <span className="text-[11px] font-medium text-slate-400 opacity-60 transition-opacity group-hover:opacity-100">
                View details &rarr;
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}
