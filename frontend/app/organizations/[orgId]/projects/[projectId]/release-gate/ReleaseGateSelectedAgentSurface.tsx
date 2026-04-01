"use client";

import React, { useCallback, useRef } from "react";
import clsx from "clsx";
import {
  Box,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Play,
  Settings,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";

import type { ReleaseGateMapRgDetails } from "./releaseGateExpandedMapRgDetails";

export function ReleaseGateSelectedAgentSurface({
  agentLabel,
  rgDetails,
}: {
  agentLabel: string;
  rgDetails: ReleaseGateMapRgDetails | null;
}) {
  const evalListScrollRef = useRef<HTMLUListElement | null>(null);
  const handleEvalListWheel = useCallback((e: React.WheelEvent) => {
    const el = evalListScrollRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    el.scrollTop += e.deltaY;
  }, []);

  if (!rgDetails?.config) return null;

  const rgConfig = rgDetails.config;
  const runLocked = !!(rgConfig.isValidating || Boolean(rgConfig.activeJobId));
  const toolsCount = typeof rgDetails.toolsCount === "number" ? rgDetails.toolsCount : 0;
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
        "Choose baseline data from Live Logs or Saved Data.";
  const lastRunStatusLabel =
    typeof rgConfig.lastRunStatusLabel === "string" ? rgConfig.lastRunStatusLabel.trim() : "";
  const startBlockedReason = (() => {
    if (rgConfig.isValidating) {
      if (rgConfig.cancelRequested) return "Canceling…";
      return "Run in progress.";
    }
    if (rgConfig.keyIssueBlocked) {
      return String(
        rgConfig.keyRegistrationMessage || "Run blocked: API key not registered."
      ).trim();
    }
    if (
      typeof rgConfig.selectedBaselineCount === "number" &&
      rgConfig.selectedBaselineCount === 0
    ) {
      return "Select baseline data in Live Logs or Saved Data.";
    }
    if (!rgConfig.canRunValidate) {
      return "Complete required selections to enable Start.";
    }
    return "";
  })();
  const promptPreview = String(rgDetails.prompt || "")
    .trim()
    .replace(/\s+/g, " ");
  const modelLabel = String(rgDetails.model || "").trim().toLowerCase() || "—";
  const providerLabel = String(rgDetails.provider || "").trim().toLowerCase() || "release-gate";
  const samplingSummaryText =
    typeof rgConfig.samplingSummary === "string" ? rgConfig.samplingSummary.trim() : "";
  const toolsSummaryText =
    typeof rgConfig.toolsSummary === "string" ? rgConfig.toolsSummary.trim() : "";
  const overrideSummaryText =
    typeof rgConfig.overrideSummary === "string" ? rgConfig.overrideSummary.trim() : "";

  const handleStartClick = () => {
    const baselineCount =
      typeof rgConfig.selectedBaselineCount === "number" ? rgConfig.selectedBaselineCount : 0;
    const isDisabled = !rgConfig.canRunValidate || rgConfig.isValidating || baselineCount === 0;
    if (isDisabled) return;
    rgConfig.handleValidate();
  };

  const handleCancelClick = () => {
    if (!rgConfig.handleCancel) return;
    rgConfig.handleCancel();
  };

  return (
    <div className="pointer-events-auto absolute left-[344px] right-[344px] top-[110px] bottom-6 z-[60] min-w-0">
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
                  Selected Agent
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
                  {rgDetails.model || "—"}
                </span>
              </div>
              <div className="flex items-center gap-1 rounded-md border border-white/[0.07] bg-white/[0.04] px-1.5 py-0.5">
                <Wrench className="h-2.5 w-2.5 text-slate-500" />
                <span className="text-[10px] font-medium text-slate-300">
                  {toolsCount} tool{toolsCount === 1 ? "" : "s"}
                </span>
              </div>
              {overrideSummaryText && overrideSummaryText !== "Using detected model" ? (
                <div className="rounded-md border border-fuchsia-500/15 bg-fuchsia-500/[0.07] px-1.5 py-0.5">
                  <span className="text-[10px] font-medium text-fuchsia-300/80">
                    {overrideSummaryText}
                  </span>
                </div>
              ) : null}
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

        <div className="flex flex-1 min-h-0 gap-6 px-5 py-5">
          <div className="flex w-[280px] shrink-0 flex-col min-h-0 border-r border-white/[0.05] pr-5">
            <div className="mb-5 flex shrink-0 items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/40">
              <ShieldCheck className="h-4 w-4 text-emerald-500/70" />
              Eval Checks
            </div>
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar" onWheel={handleEvalListWheel}>
              {Array.isArray(rgDetails.activeChecksCards) && rgDetails.activeChecksCards.length > 0 ? (
                <ul ref={evalListScrollRef} className="space-y-4">
                  {rgDetails.activeChecksCards.map(card => (
                    <li key={card.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="truncate text-[13px] font-semibold tracking-wide text-white/90">
                          {card.label}
                        </span>
                      </div>
                      {card.params ? (
                        <div className="pl-[26px]">
                          <span className="line-clamp-2 rounded-md bg-white/[0.02] px-2 py-1 font-mono text-xs text-white/40">
                            {card.params}
                          </span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : Array.isArray(rgDetails.activeChecks) && rgDetails.activeChecks.length > 0 ? (
                <ul ref={evalListScrollRef} className="space-y-3">
                  {rgDetails.activeChecks.map((name, i) => (
                    <li key={`${name}-${i}`} className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="truncate text-[13px] font-semibold tracking-wide text-white/90">
                        {name.replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-white/5 p-4 text-sm text-white/40">
                  No active checks configured.
                </p>
              )}
            </div>

            <div className="mt-6 shrink-0">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                <ShieldCheck className="h-3.5 w-3.5 text-amber-400/70" />
                Policy Checks
              </div>
              {Array.isArray(rgDetails.policyCheckCards) && rgDetails.policyCheckCards.length > 0 ? (
                <ul className="space-y-3">
                  {rgDetails.policyCheckCards.map(card => (
                    <li key={card.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-amber-300" />
                        <span className="truncate text-[13px] font-semibold tracking-wide text-white/90">
                          {card.label}
                        </span>
                      </div>
                      {card.detail ? (
                        <div className="pl-[26px]">
                          <span className="line-clamp-2 rounded-md bg-white/[0.02] px-2 py-1 text-xs text-white/40">
                            {card.detail}
                          </span>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-white/5 px-3 py-2 text-xs text-white/40">
                  No policy checks enabled.
                </p>
              )}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col min-h-0">
            <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                Config Summary
              </div>
              {configSourceLabel ? (
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/70">
                  {configSourceLabel}
                </span>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-white/[0.02] px-3 py-2 transition-colors hover:bg-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">Model</div>
                  <div className="mt-1 truncate text-white/90" title={modelLabel}>
                    {modelLabel}
                  </div>
                </div>
                <div className="rounded-lg bg-white/[0.02] px-3 py-2 transition-colors hover:bg-white/[0.04]">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                    Provider
                  </div>
                  <div className="mt-1 truncate text-white/90" title={providerLabel}>
                    {providerLabel}
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.02] px-3 py-2 transition-colors hover:bg-white/[0.04]">
                <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                  System prompt
                </div>
                <p
                  className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/90"
                  title={promptPreview || "No system prompt configured."}
                >
                  {promptPreview || "No system prompt configured."}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 text-[11px]">
                <div className="rounded-lg bg-white/[0.02] px-3 py-2 text-white/80 transition-colors hover:bg-white/[0.04]">
                  <span className="text-white/40">Sampling:</span>{" "}
                  {samplingSummaryText || "Using provider defaults"}
                </div>
                <div className="rounded-lg bg-white/[0.02] px-3 py-2 text-white/80 transition-colors hover:bg-white/[0.04]">
                  <span className="text-white/40">Tools:</span> {toolsSummaryText || "No tools configured"}
                </div>
                <div className="rounded-lg bg-white/[0.02] px-3 py-2 text-white/80 transition-colors hover:bg-white/[0.04]">
                  <span className="text-white/40">Override:</span>{" "}
                  {overrideSummaryText || "Using detected model"}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col border-t border-white/5 pt-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.15em] text-white/40">
                  Payload (raw preview)
                </div>
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-white/60 custom-scrollbar">
                  {String(rgConfig.originalPayloadPreview || "{}")}
                </pre>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-4 border-t border-white/[0.08] px-5 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="shrink-0 text-sm font-medium text-white/60">{baselineSummaryText}</span>
            {lastRunStatusLabel ? (
              <span
                className={clsx(
                  "shrink-0 rounded-lg border px-2.5 py-1 text-xs font-bold uppercase tracking-wider",
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
            {startBlockedReason ? (
              <span className="truncate border-l-2 border-amber-500/50 bg-amber-500/5 px-3 py-1.5 text-[13px] font-medium text-amber-100/90">
                {startBlockedReason}
              </span>
            ) : runError ? (
              <div
                className="truncate border-l-2 border-rose-500/50 bg-rose-500/5 px-3 py-1.5 text-[13px] font-medium text-rose-100"
                title={runError}
              >
                {runError}
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-3">
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
                  if (rgConfig.isValidating) return;
                  rgConfig.setRepeatDropdownOpen(!rgConfig.repeatDropdownOpen);
                }}
                disabled={rgConfig.isValidating}
                data-testid="rg-repeat-trigger"
                className={clsx(
                  "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black uppercase transition",
                  rgConfig.isHeavyRepeat
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                    : "border-white/10 bg-white/[0.02] text-white/90 hover:bg-white/[0.08]",
                  rgConfig.isValidating && "cursor-not-allowed opacity-50"
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
                          if (rgConfig.isValidating) return;
                          rgConfig.handleRepeatSelect(option);
                        }}
                        disabled={rgConfig.isValidating}
                        data-testid={`rg-repeat-option-${option}`}
                        className={clsx(
                          "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition",
                          isActive && "bg-fuchsia-500/20 text-fuchsia-100",
                          !isActive && !heavy && "text-white/90 hover:bg-white/[0.05]",
                          !isActive && heavy && "bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
                          rgConfig.isValidating && "cursor-not-allowed opacity-50"
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
                disabled={rgConfig.cancelRequested}
                data-testid="rg-run-cancel-btn"
                className={clsx(
                  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-white/20",
                  rgConfig.cancelRequested && "cursor-not-allowed opacity-50"
                )}
              >
                <X className="h-4 w-4" />
                {rgConfig.cancelRequested
                  ? "Canceling…"
                  : rgConfig.activeJobId
                    ? "Cancel"
                    : "Cancel (starting…)"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleStartClick}
              data-testid="rg-run-start-btn"
              disabled={
                !rgConfig.canRunValidate ||
                rgConfig.isValidating ||
                (typeof rgConfig.selectedBaselineCount === "number" &&
                  rgConfig.selectedBaselineCount === 0)
              }
              className={clsx(
                "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 px-7 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:from-indigo-500 hover:to-fuchsia-500 shadow-[0_0_20px_rgba(217,70,239,0.3)] hover:shadow-[0_0_25px_rgba(217,70,239,0.5)]",
                (!rgConfig.canRunValidate ||
                  rgConfig.isValidating ||
                  (typeof rgConfig.selectedBaselineCount === "number" &&
                    rgConfig.selectedBaselineCount === 0)) &&
                  "cursor-not-allowed opacity-50 shadow-none"
              )}
            >
              {rgConfig.isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  Start
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
