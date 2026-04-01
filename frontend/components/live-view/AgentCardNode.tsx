"use client";

import React, { memo, useRef, useCallback } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import clsx from "clsx";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Loader2,
  Play,
  X,
  Settings,
  Box,
  Wrench,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

export type AgentCardNodeData = {
  label: string;
  model?: string;
  isOfficial?: boolean;
  isGhost?: boolean;
  driftStatus?: "official" | "ghost" | "zombie";
  signals?: Record<string, number>;
  total?: number;
  worstCount?: number;
  theme?: "liveView" | "releaseGate";
  rgDetails?: any;
  /** When true, node is blurred (e.g. another node is selected). */
  blur?: boolean;
};

export const AgentCardNode = memo(({ id, data, selected, dragging }: NodeProps<AgentCardNodeData>) => {
  const { label, model, theme = "liveView", blur: shouldBlur, rgDetails } = data;
  const isCritical = (data.worstCount || 0) > 0;
  const isRG = theme === "releaseGate";
  const isActuallySelected = selected && !dragging;
  const showRgDetail = isRG && isActuallySelected && rgDetails;
  const rgConfig = showRgDetail && rgDetails?.config ? rgDetails.config : null;
  const toolsCount =
    showRgDetail && typeof rgDetails?.toolsCount === "number"
      ? (rgDetails.toolsCount as number)
      : 0;
  const runError =
    rgConfig && typeof rgConfig.runError === "string" ? (rgConfig.runError as string).trim() : "";
  const runLocked = !!(
    rgConfig &&
    (rgConfig.isValidating || Boolean((rgConfig as any)?.activeJobId))
  );
  const startBlockedReason = rgConfig
    ? (() => {
        if (rgConfig.isValidating) {
          if (Boolean((rgConfig as any)?.cancelRequested)) return "Canceling…";
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
      })()
    : "";
  const configSourceLabel =
    rgConfig && typeof rgConfig.configSourceLabel === "string"
      ? String(rgConfig.configSourceLabel).trim()
      : "";
  const hasSelectedBaseline = !!(
    rgConfig &&
    typeof rgConfig.selectedBaselineCount === "number" &&
    rgConfig.selectedBaselineCount > 0
  );
  const baselineSummaryText = rgConfig
    ? hasSelectedBaseline
      ? String(rgConfig.selectedDataSummary || "").trim()
      : configSourceLabel
        ? `Preview source: ${configSourceLabel}`
        : String(rgConfig.selectedDataSummary || "").trim() ||
          "Choose baseline data from Live Logs or Saved Data."
    : "Choose baseline data from Live Logs or Saved Data.";
  const lastRunStatusLabel =
    rgConfig && typeof rgConfig.lastRunStatusLabel === "string"
      ? String(rgConfig.lastRunStatusLabel).trim()
      : "";
  const promptPreview = String((rgDetails as any)?.prompt || "")
    .trim()
    .replace(/\s+/g, " ");
  const modelLabel =
    String((rgDetails as any)?.model || model || "")
      .trim()
      .toLowerCase() || "—";
  const providerLabel =
    String((rgDetails as any)?.provider || "").trim().toLowerCase() || (isRG ? "release-gate" : "live-view");
  const samplingSummaryText =
    rgConfig && typeof (rgConfig as any)?.samplingSummary === "string"
      ? String((rgConfig as any).samplingSummary).trim()
      : "";
  const toolsSummaryText =
    rgConfig && typeof (rgConfig as any)?.toolsSummary === "string"
      ? String((rgConfig as any).toolsSummary).trim()
      : "";
  const overrideSummaryText =
    rgConfig && typeof (rgConfig as any)?.overrideSummary === "string"
      ? String((rgConfig as any).overrideSummary).trim()
      : "";
  const evalListScrollRef = useRef<HTMLUListElement | null>(null);

  const handleEvalListWheel = useCallback((e: React.WheelEvent) => {
    const el = evalListScrollRef.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    el.scrollTop += e.deltaY;
  }, []);

  const handleStartClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!rgConfig || !rgConfig.handleValidate) return;

    const baselineCount =
      typeof rgConfig.selectedBaselineCount === "number" ? rgConfig.selectedBaselineCount : 0;

    const isDisabled = !rgConfig.canRunValidate || rgConfig.isValidating || baselineCount === 0;

    if (isDisabled) return;

    rgConfig.handleValidate();
  };

  const handleCancelClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!rgConfig || !rgConfig.handleCancel) return;
    rgConfig.handleCancel();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{ type: "spring", stiffness: 80, damping: 18, mass: 1.2 }}
      onWheel={showRgDetail ? e => e.stopPropagation() : undefined}
      className={clsx(
        "rounded-[14px] border relative cursor-pointer group flex flex-col transition-all duration-200",
        showRgDetail ? "w-[800px] h-[580px] shrink-0" : "w-[240px]",
        shouldBlur && "blur-[3px] opacity-40",
        isCritical
          ? "bg-[#1C1C1E] border-rose-500/40 shadow-lg"
          : "bg-[#1C1C1E] border-[#3A3A3C] shadow-lg"
      )}
      data-testid={isRG ? `rg-node-${id}` : undefined}
      style={{ transformStyle: "preserve-3d", perspective: "1000px" }}
    >
      {/* Front Face */}
      <div
        className="w-full h-full relative z-20 flex flex-col rounded-[16px] overflow-hidden bg-inherit"
        style={{ backfaceVisibility: "hidden" }}
      >

        <div
          className={clsx(
            "flex flex-col relative z-20 w-full h-full",
            showRgDetail ? "p-5" : "p-4",
            !showRgDetail && "min-h-[76px]"
          )}
        >
          {/* Header */}
          <div
            className={clsx(
              "flex items-start justify-between shrink-0 overflow-hidden",
              showRgDetail ? "border-b border-white/[0.06] pb-5 mb-5" : ""
            )}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
              {/* Icon — sidebar button style */}
              <div
                className={clsx(
                  "w-[38px] h-[38px] rounded-[12px] border flex items-center justify-center shrink-0 transition-all duration-200 relative",
                  isCritical
                    ? "bg-rose-500/[0.07] border-rose-500/15"
                    : "bg-white/[0.04] border-white/[0.1] group-hover:bg-white/[0.06] group-hover:border-white/[0.16]"
                )}
              >
                <div className="absolute inset-0 rounded-[12px] bg-gradient-to-b from-white/[0.05] to-transparent" />
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={clsx(
                    "relative z-10",
                    isCritical ? "text-rose-400/70" : isRG ? "text-fuchsia-400/70" : "text-emerald-400/70"
                  )}
                >
                  {isRG ? (
                    <>
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" x2="4" y1="22" y2="15" />
                    </>
                  ) : (
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  )}
                </svg>
              </div>

              {/* Text — strictly contained */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex items-center gap-1 mb-[3px]">
                  <span className={clsx(
                    "text-[8.5px] font-medium uppercase tracking-[0.18em] shrink-0",
                    isCritical ? "text-rose-500/60" : "text-slate-600"
                  )}>
                    Agent
                  </span>
                  <span className="text-slate-700/60 text-[8px] shrink-0">·</span>
                </div>
                {/* Name: truncate with tooltip via title */}
                <h3
                  className="text-[12px] font-semibold text-white/85 tracking-tight leading-tight truncate w-full"
                  title={label}
                >
                  {label}
                </h3>

                {showRgDetail ? (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07]">
                      <Box className="w-2.5 h-2.5 text-slate-500" />
                      <span className="text-[9px] font-medium text-slate-400 truncate max-w-[80px]">
                        {rgDetails.model ? String(rgDetails.model) : model || "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07]">
                      <Wrench className="w-2.5 h-2.5 text-slate-500" />
                      <span className="text-[9px] font-medium text-slate-400">
                        {toolsCount}t
                      </span>
                    </div>
                    {rgConfig?.overrideSummary && rgConfig.overrideSummary !== "No overrides" && (
                      <div className="px-1.5 py-0.5 rounded-md bg-fuchsia-500/[0.07] border border-fuchsia-500/15">
                        <span className="text-[9px] font-medium text-fuchsia-400/70">Override</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600/80 mt-0.5 truncate w-full" title={model || ""}>
                    {model || "—"}
                  </p>
                )}
              </div>
            </div>

            {showRgDetail && rgConfig && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (runLocked) return;
                  if (rgConfig.openSettings) rgConfig.openSettings();
                }}
                disabled={runLocked}
                title={runLocked ? "Settings are locked during a run." : "Open settings"}
                className={clsx(
                  "p-3 rounded-2xl border transition-all duration-200 shadow-sm flex items-center gap-2 h-11",
                  runLocked
                    ? "border-white/5 bg-white/[0.02] text-slate-600 cursor-not-allowed"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/20"
                )}
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm font-semibold pr-1">Settings</span>
              </button>
            )}
          </div>

          {/* Body Content (Release Gate) */}
          {showRgDetail && rgConfig && (
            <div className="flex flex-1 min-h-0 gap-8">
              {/* Left Column: Eval Checks */}
              <div className="w-[280px] flex flex-col min-h-0 shrink-0 pr-2">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-white/40 mb-5 shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-500/70" />
                  Eval Checks
                </div>

                <div
                  className="flex-1 overflow-y-auto custom-scrollbar pr-2"
                  onWheel={handleEvalListWheel}
                >
                  {Array.isArray(rgDetails.activeChecksCards) &&
                  rgDetails.activeChecksCards.length > 0 ? (
                    <ul ref={evalListScrollRef} className="space-y-4">
                      {rgDetails.activeChecksCards.map(
                        (card: { id: string; label: string; params: string }) => (
                          <li key={card.id} className="flex flex-col gap-1.5 group/check">
                            <div className="flex items-center gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="text-[13px] font-semibold text-white/90 tracking-wide group-hover/check:text-white transition-colors truncate">
                                {card.label}
                              </span>
                            </div>
                            {card.params ? (
                              <div className="pl-[26px]">
                                <span className="text-xs font-mono text-white/40 bg-white/[0.02] px-2 py-1 rounded-md line-clamp-2">
                                  {card.params}
                                </span>
                              </div>
                            ) : null}
                          </li>
                        )
                      )}
                    </ul>
                  ) : Array.isArray(rgDetails.activeChecks) && rgDetails.activeChecks.length > 0 ? (
                    <ul ref={evalListScrollRef} className="space-y-3">
                      {rgDetails.activeChecks.map((name: string, i: number) => (
                        <li key={`${name}-${i}`} className="flex items-center gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span className="text-[13px] font-semibold text-white/90 tracking-wide truncate">
                            {name.replace(/_/g, " ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-white/40 p-4 rounded-xl border border-white/5 border-dashed">
                      No active checks configured.
                    </p>
                  )}
                </div>

                <div className="mt-6 shrink-0">
                  <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40 mb-3">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400/70" />
                    Policy Checks
                  </div>
                  {Array.isArray(rgDetails.policyCheckCards) && rgDetails.policyCheckCards.length > 0 ? (
                    <ul className="space-y-3">
                      {rgDetails.policyCheckCards.map(
                        (card: { id: string; label: string; detail: string }) => (
                          <li key={card.id} className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-amber-300 shrink-0" />
                              <span className="text-[13px] font-semibold text-white/90 tracking-wide truncate">
                                {card.label}
                              </span>
                            </div>
                            {card.detail ? (
                              <div className="pl-[26px]">
                                <span className="text-xs text-white/40 bg-white/[0.02] px-2 py-1 rounded-md line-clamp-2">
                                  {card.detail}
                                </span>
                              </div>
                            ) : null}
                          </li>
                        )
                      )}
                    </ul>
                  ) : (
                    <p className="text-xs text-white/40 px-3 py-2 rounded-xl border border-white/5 border-dashed">
                      No policy checks enabled.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: Config summary */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                    Config Summary
                  </div>
                  {configSourceLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/70">
                      {configSourceLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">Model</div>
                      <div className="mt-1 text-white/90 truncate" title={modelLabel}>
                        {modelLabel}
                      </div>
                    </div>
                    <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">Provider</div>
                      <div className="mt-1 text-white/90 truncate" title={providerLabel}>
                        {providerLabel}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
                      System prompt
                    </div>
                    <p
                      className="mt-1 text-[11px] text-white/90 leading-relaxed line-clamp-2"
                      title={promptPreview || "No system prompt configured."}
                    >
                      {promptPreview || "No system prompt configured."}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-[11px]">
                    <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2 text-white/80">
                      <span className="text-white/40">Sampling:</span>{" "}
                      {samplingSummaryText || "Using provider defaults"}
                    </div>
                    <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2 text-white/80">
                      <span className="text-white/40">Tools:</span> {toolsSummaryText || "No tools configured"}
                    </div>
                    <div className="rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors px-3 py-2 text-white/80">
                      <span className="text-white/40">Override:</span> {overrideSummaryText || "Using detected model"}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex-1 min-h-0">
                    <div className="text-[10px] uppercase tracking-[0.15em] text-white/40 mb-1">
                      Payload (raw preview)
                    </div>
                    <pre className="h-full overflow-auto text-[11px] leading-relaxed text-white/60 font-mono whitespace-pre-wrap break-words custom-scrollbar">
                      {String(rgConfig.originalPayloadPreview || "{}")}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer (Release Gate) */}
          {showRgDetail && rgConfig && (
            <div className="mt-6 pt-5 border-t border-white/10 shrink-0 flex items-center justify-between gap-4">
              {/* Footer Left: Messages & Status */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <span className="text-sm font-medium text-white/60 shrink-0">
                  {baselineSummaryText}
                </span>

                {lastRunStatusLabel && (
                  <span
                    className={clsx(
                      "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border shrink-0",
                      (lastRunStatusLabel === "Healthy" || lastRunStatusLabel === "Passed") &&
                        "text-emerald-300 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
                      (lastRunStatusLabel === "Flagged" ||
                        lastRunStatusLabel === "Failed" ||
                        lastRunStatusLabel === "Canceling") &&
                        "text-rose-300 border-rose-500/30 bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.1)]",
                      lastRunStatusLabel === "Running" &&
                        "text-indigo-300 border-indigo-500/30 bg-indigo-500/10 shadow-[0_0_10px_rgba(99,102,241,0.1)]",
                      ![
                        "Healthy",
                        "Flagged",
                        "Passed",
                        "Failed",
                        "Running",
                        "Canceling",
                      ].includes(lastRunStatusLabel) &&
                        "text-white/60 border-white/10 bg-white/5"
                    )}
                  >
                    {lastRunStatusLabel}
                    {rgConfig?.lastRunWallMs
                      ? ` (${(rgConfig.lastRunWallMs / 1000).toFixed(1)}s)`
                      : ""}
                  </span>
                )}

                {startBlockedReason ? (
                  <span className="text-[13px] font-medium text-amber-100/90 bg-amber-500/5 px-3 py-1.5 border-l-2 border-amber-500/50 truncate">
                    {startBlockedReason}
                  </span>
                ) : runError ? (
                  <div
                    className="border-l-2 border-rose-500/50 bg-rose-500/5 px-3 py-1.5 text-[13px] font-medium text-rose-100 truncate"
                    title={runError}
                  >
                    {runError}
                  </div>
                ) : null}
              </div>

              {/* Footer Right: Controls */}
              <div className="flex items-center gap-3 shrink-0">
                <div ref={rgConfig.repeatDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      if (rgConfig.isValidating) return;
                      rgConfig.setRepeatDropdownOpen(!rgConfig.repeatDropdownOpen);
                    }}
                    disabled={!!rgConfig.isValidating}
                    data-testid="rg-repeat-trigger"
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black uppercase transition",
                      rgConfig.isHeavyRepeat
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        : "border-white/10 bg-white/[0.02] text-white/90 hover:bg-white/[0.08]",
                      rgConfig.isValidating && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {rgConfig.repeatRuns}x
                    <ChevronDown
                      className={clsx(
                        "h-4 w-4 transition-transform",
                        rgConfig.repeatDropdownOpen && "rotate-180"
                      )}
                    />
                  </button>
                  {rgConfig.repeatDropdownOpen && (
                    <div className="absolute bottom-full mb-2 right-0 min-w-[150px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1b23] shadow-2xl z-50">
                      {rgConfig.REPEAT_OPTIONS.map((option: number) => {
                        const heavy = option === 50 || option === 100;
                        const isActive = option === rgConfig.repeatRuns;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              if (rgConfig.isValidating) return;
                              rgConfig.handleRepeatSelect(option);
                            }}
                            disabled={!!rgConfig.isValidating}
                            data-testid={`rg-repeat-option-${option}`}
                            className={clsx(
                              "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition",
                              isActive && "bg-fuchsia-500/20 text-fuchsia-100",
                              !isActive && !heavy && "text-white/90 hover:bg-white/[0.05]",
                              !isActive &&
                                heavy &&
                                "bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
                              rgConfig.isValidating && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            <span>{option}x</span>
                            {heavy && (
                              <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                                Heavy
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {rgConfig.isValidating && typeof rgConfig.handleCancel === "function" && (
                  <button
                    type="button"
                    onClick={handleCancelClick}
                    disabled={Boolean((rgConfig as any)?.cancelRequested)}
                    data-testid="rg-run-cancel-btn"
                    className={clsx(
                      "inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white transition hover:bg-white/20",
                      Boolean((rgConfig as any)?.cancelRequested) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <X className="h-4 w-4" />
                    {Boolean((rgConfig as any)?.cancelRequested)
                      ? "Canceling…"
                      : (rgConfig as any)?.activeJobId
                        ? "Cancel"
                        : "Cancel (starting…)"}
                  </button>
                )}

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
                      "opacity-50 cursor-not-allowed shadow-none"
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
          )}
        </div>
      </div>

      {/* Handles (Visually hidden) */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 z-50 opacity-0 pointer-events-none">
        <Handle type="target" position={Position.Left} />
      </div>
      <div className="absolute right-0 top-1/2 -translate-y-1/2 z-50 opacity-0 pointer-events-none">
        <Handle type="source" position={Position.Right} />
      </div>
    </motion.div>
  );
});

AgentCardNode.displayName = "AgentCardNode";
