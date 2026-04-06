"use client";

import React from "react";
import clsx from "clsx";
import {
  Box,
  CheckCircle2,
  ChevronDown,
  Hourglass,
  Loader2,
  Play,
  Settings,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";

import type { ReleaseGateMapRgDetails } from "./releaseGateExpandedMapRgDetails";
import { getReleaseGateSelectedAgentSurfacePhase } from "./releaseGateMainViewState";

export function ReleaseGateSelectedAgentSurface({
  agentLabel,
  rgDetails,
}: {
  agentLabel: string;
  rgDetails: ReleaseGateMapRgDetails | null;
}) {
  const surfacePhase = getReleaseGateSelectedAgentSurfacePhase(rgDetails);

  if (surfacePhase === "pending") {
    return (
      <div
        className="pointer-events-auto fixed left-[372px] right-[372px] top-[116px] bottom-8 z-[10000] min-w-0"
        data-testid="rg-selected-agent-surface-pending"
      >
        <div className="flex h-full min-h-0 flex-col justify-center overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#12121a]/92 px-8 text-center shadow-[0_25px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-fuchsia-500/20 bg-fuchsia-500/[0.08]">
            <Hourglass className="h-6 w-6 text-fuchsia-300/80" />
          </div>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-white">
            Preparing selected agent
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {agentLabel} is selected. We are still resolving the center panel for this agent, so
            the side panels are available first.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            If this message stays visible, reopen the agent or return to map view and select it
            again.
          </p>
        </div>
      </div>
    );
  }

  const resolvedDetails = rgDetails as ReleaseGateMapRgDetails;
  const rgConfig = resolvedDetails.config;
  const runLocked = !!rgConfig.runLocked;
  const toolsCount = typeof resolvedDetails.toolsCount === "number" ? resolvedDetails.toolsCount : 0;
  const runError = typeof rgConfig.runError === "string" ? rgConfig.runError.trim() : "";
  const configSourceLabel =
    typeof rgConfig.configSourceLabel === "string" ? rgConfig.configSourceLabel.trim() : "";
  const hasSelectedBaseline =
    typeof rgConfig.selectedBaselineCount === "number" && rgConfig.selectedBaselineCount > 0;
  const baselineSummaryText = hasSelectedBaseline
    ? String(rgConfig.selectedDataSummary || "").trim()
    : configSourceLabel
      ? `Preview source: ${configSourceLabel}`
      : String(rgConfig.selectedDataSummary || "").trim() ||
        "Choose baseline data from Live snapshots or Saved sets.";
  const lastRunStatusLabel =
    typeof rgConfig.lastRunStatusLabel === "string" ? rgConfig.lastRunStatusLabel.trim() : "";
  const startBlockedReason = (() => {
    if (rgConfig.isValidating) {
      if (rgConfig.cancelRequested) return "Canceling...";
      return "Run in progress.";
    }
    if (runLocked) {
      return "Another Release Gate run is already in progress.";
    }
    if (rgConfig.keyIssueBlocked) {
      return "Register an OpenAI key to run this experiment.";
    }
    if (
      typeof rgConfig.selectedBaselineCount === "number" &&
      rgConfig.selectedBaselineCount === 0
    ) {
      return "Select baseline data in Live snapshots or Saved sets.";
    }
    if (!rgConfig.canRunValidate) {
      return "Complete required selections to run the experiment.";
    }
    return "";
  })();
  const cancelDisabled = rgConfig.cancelRequested || rgConfig.cancelLocked;
  const cancelLabel = rgConfig.cancelRequested
    ? "Canceling..."
    : rgConfig.cancelLocked
      ? "Usage Counted"
      : rgConfig.activeJobId
        ? "Cancel"
        : "Cancel startup";
  const cancelTitle = rgConfig.cancelLocked
    ? "This run has already started and usage has been counted."
    : undefined;
  const startDisabled =
    !rgConfig.canRunValidate ||
    runLocked ||
    (typeof rgConfig.selectedBaselineCount === "number" && rgConfig.selectedBaselineCount === 0);
  const promptPreview = String(resolvedDetails.prompt || "")
    .trim()
    .replace(/\s+/g, " ");
  const modelLabel = String(resolvedDetails.model || "").trim().toLowerCase() || "unknown";
  const providerLabel =
    String(resolvedDetails.provider || "").trim().toLowerCase() || "release-gate";
  const samplingSummaryText =
    typeof rgConfig.samplingSummary === "string" ? rgConfig.samplingSummary.trim() : "";
  const toolsSummaryText =
    typeof rgConfig.toolsSummary === "string" ? rgConfig.toolsSummary.trim() : "";
  const overrideSummaryText =
    typeof rgConfig.overrideSummary === "string" ? rgConfig.overrideSummary.trim() : "";
  const selectedBaselineCount =
    typeof rgConfig.selectedBaselineCount === "number" ? rgConfig.selectedBaselineCount : 0;
  const checksPreview = Array.isArray(resolvedDetails.activeChecksCards)
    ? resolvedDetails.activeChecksCards.slice(0, 4).map(card => card.label)
    : Array.isArray(resolvedDetails.activeChecks)
      ? resolvedDetails.activeChecks.slice(0, 4).map(name => name.replace(/_/g, " "))
      : [];
  const checksCount = Array.isArray(resolvedDetails.activeChecksCards)
    ? resolvedDetails.activeChecksCards.length
    : Array.isArray(resolvedDetails.activeChecks)
      ? resolvedDetails.activeChecks.length
      : 0;
  const policyChecksCount = Array.isArray(resolvedDetails.policyCheckCards)
    ? resolvedDetails.policyCheckCards.length
    : 0;

  const handleStartClick = () => {
    const isDisabled = !rgConfig.canRunValidate || runLocked || selectedBaselineCount === 0;
    if (isDisabled) return;
    rgConfig.handleValidate();
  };

  const handleCancelClick = () => {
    if (!rgConfig.handleCancel) return;
    rgConfig.handleCancel();
  };

  return (
    <div
      className="pointer-events-auto fixed left-[372px] right-[372px] top-[116px] bottom-8 z-[10000] min-w-0"
      data-testid="rg-selected-agent-surface"
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#12121a]/92 shadow-[0_25px_80px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-fuchsia-500/20 bg-fuchsia-500/[0.08]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-fuchsia-300/80"
                >
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" x2="4" y1="22" y2="15" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Experiment Target
                </span>
                <h2 className="mt-1 truncate text-lg font-semibold tracking-tight text-white">
                  {agentLabel}
                </h2>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5">
                <Box className="h-2.5 w-2.5 text-slate-500" />
                <span className="max-w-[120px] truncate text-[10px] font-medium text-slate-300">
                  {resolvedDetails.model || "Unknown"}
                </span>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5">
                <Wrench className="h-2.5 w-2.5 text-slate-500" />
                <span className="text-[10px] font-medium text-slate-300">
                  {toolsCount} tool{toolsCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (runLocked) return;
              rgConfig.openSettings();
            }}
            disabled={runLocked}
            title={runLocked ? "Settings are locked during a run." : "Open settings"}
            className={clsx(
              "flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 transition-all duration-200",
              runLocked
                ? "cursor-not-allowed border-white/5 bg-white/[0.02] text-slate-600"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white"
            )}
          >
            <Settings className="h-4 w-4" />
            <span className="pr-1 text-sm font-semibold">Settings</span>
          </button>
        </div>

        {(startBlockedReason || runError) && (
          <div className="shrink-0 border-b border-white/[0.06] px-5 py-3">
            <div
              className={clsx(
                "rounded-2xl border px-4 py-3",
                runError
                  ? "border-rose-500/40 bg-rose-500/[0.08] text-rose-100"
                  : "border-amber-500/40 bg-amber-500/[0.08] text-amber-100"
              )}
            >
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-current/75">
                {runError ? "Run error" : rgConfig.isValidating ? "Run in progress" : "Action needed"}
              </div>
              <div className="mt-1 text-[13px] font-medium leading-relaxed">
                {runError || startBlockedReason}
              </div>
              {!runError && rgConfig.keyIssueBlocked ? (
                <div className="mt-1 text-[12px] leading-relaxed text-current/80">
                  Open Live View, select the node, then add the key in Settings {">"} API Keys.
                </div>
              ) : null}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5 custom-scrollbar">
            <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.02] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Run Experiment
              </p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Run this setup against selected production snapshots.
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Review the setup below, then run the experiment.
              </p>
            </div>

            <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-white/[0.02]">
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-400/10">
                  <Box className="h-3.5 w-3.5 text-sky-400/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Inputs
                  </div>
                  <div className="mt-1 text-sm font-semibold text-white">
                    {selectedBaselineCount > 0
                      ? `${selectedBaselineCount} ${selectedBaselineCount === 1 ? "input" : "inputs"} selected`
                      : "No inputs selected"}
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{baselineSummaryText}</p>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fuchsia-400/10">
                    <Wrench className="h-3.5 w-3.5 text-fuchsia-300/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Test setup
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {resolvedDetails.model || "Unknown model"}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      {providerLabel}
                      <span className="px-1.5 text-white/25">·</span>
                      {toolsCount} tools
                      {configSourceLabel ? (
                        <>
                          <span className="px-1.5 text-white/25">·</span>
                          {configSourceLabel}
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/[0.06] px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-400/10">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Checks
                    </div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {checksCount + policyChecksCount > 0
                        ? `${checksCount + policyChecksCount} active`
                        : "No checks configured"}
                    </div>
                    {checksPreview.length > 0 ? (
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        {checksPreview.slice(0, 3).join(", ")}
                        {checksCount + policyChecksCount > 3
                          ? `, +${checksCount + policyChecksCount - 3} more`
                          : ""}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm leading-6 text-slate-400">
                        Add evaluation or policy checks in Settings before running the experiment.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 border-t border-white/[0.08] bg-black/20 px-6 pb-6 pt-5 shadow-[0_-14px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <span className="min-w-0 text-sm font-medium leading-snug text-white/60">{baselineSummaryText}</span>
            {lastRunStatusLabel ? (
              <span
                className={clsx(
                  "w-fit shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
                  (lastRunStatusLabel === "Healthy" || lastRunStatusLabel === "Passed") &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                  (lastRunStatusLabel === "Flagged" ||
                    lastRunStatusLabel === "Failed" ||
                    lastRunStatusLabel === "Canceling") &&
                    "border-rose-500/30 bg-rose-500/10 text-rose-300",
                  lastRunStatusLabel === "Running" &&
                    "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
                  !["Healthy", "Flagged", "Passed", "Failed", "Running", "Canceling"].includes(
                    lastRunStatusLabel
                  ) && "border-white/10 bg-white/5 text-white/60"
                )}
              >
                {lastRunStatusLabel}
                {rgConfig.lastRunWallMs ? ` (${(rgConfig.lastRunWallMs / 1000).toFixed(1)}s)` : ""}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
            <div
              ref={node => {
                (
                  rgConfig.repeatDropdownRef as React.MutableRefObject<HTMLDivElement | null>
                ).current = node;
              }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => {
                  if (runLocked) return;
                  rgConfig.setRepeatDropdownOpen(!rgConfig.repeatDropdownOpen);
                }}
                disabled={runLocked}
                data-testid="rg-repeat-trigger"
                className={clsx(
                  "inline-flex min-h-[56px] items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black uppercase transition",
                  rgConfig.isHeavyRepeat
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border-white/10 bg-white/[0.02] text-white/90 hover:bg-white/[0.08]",
                  runLocked && "cursor-not-allowed opacity-50"
                )}
              >
                {rgConfig.repeatRuns}x
                <ChevronDown
                  className={clsx("h-4 w-4 transition-transform", rgConfig.repeatDropdownOpen && "rotate-180")}
                />
              </button>
              {rgConfig.repeatDropdownOpen ? (
                <div className="absolute bottom-full right-0 z-50 mb-2 min-w-[150px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1b23] shadow-2xl">
                  {rgConfig.REPEAT_OPTIONS.map(option => {
                    const heavy = option === 50 || option === 100;
                    const isActive = option === rgConfig.repeatRuns;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => {
                          if (runLocked) return;
                          rgConfig.handleRepeatSelect(option);
                        }}
                        disabled={runLocked}
                        data-testid={`rg-repeat-option-${option}`}
                        className={clsx(
                          "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition",
                          isActive && "bg-fuchsia-500/20 text-fuchsia-100",
                          !isActive && !heavy && "text-white/90 hover:bg-white/[0.05]",
                          !isActive && heavy && "bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
                          runLocked && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <span>{option}x</span>
                        {heavy ? (
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                            Heavy
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {rgConfig.isValidating && typeof rgConfig.handleCancel === "function" ? (
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={cancelDisabled}
                title={cancelTitle}
                data-testid="rg-run-cancel-btn"
                className={clsx(
                  "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white transition",
                  cancelDisabled
                    ? "cursor-not-allowed opacity-50"
                    : "hover:bg-white/20"
                )}
              >
                <X className="h-4 w-4" />
                {cancelLabel}
              </button>
            ) : null}

            <div className="relative flex flex-col items-end">
              <button
                type="button"
                onClick={handleStartClick}
                data-testid="rg-run-start-btn"
                disabled={startDisabled}
                className={clsx(
                  "inline-flex h-[56px] min-w-[160px] items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-8 text-[15px] font-black uppercase tracking-[0.15em] text-white transition-all shadow-[0_0_24px_rgba(192,38,211,0.4)] hover:bg-fuchsia-500 hover:shadow-[0_0_32px_rgba(192,38,211,0.6)]",
                  startDisabled && "cursor-not-allowed opacity-50 shadow-none hover:bg-fuchsia-600 hover:shadow-none"
                )}
              >
                {rgConfig.isValidating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Validating
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5 fill-current" />
                    Run experiment
                  </>
                )}
              </button>
              {rgConfig.cancelLocked ? (
                <span className="absolute top-full mt-2 whitespace-nowrap text-[11px] font-medium text-amber-200/85">
                  Usage already counted for this run.
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
