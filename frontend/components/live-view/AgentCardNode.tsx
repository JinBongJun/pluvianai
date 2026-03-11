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

export const AgentCardNode = memo(({ id, data, selected }: NodeProps<AgentCardNodeData>) => {
  const { label, model, theme = "liveView", blur: shouldBlur, rgDetails } = data;
  const isCritical = (data.worstCount || 0) > 0;
  const isRG = theme === "releaseGate";
  const showRgDetail = isRG && selected && rgDetails;
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
        if (rgConfig.keyBlocked && !rgConfig.modelOverrideEnabled) {
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
      animate={{
        opacity: 1,
        scale: selected ? 1.02 : 1,
        rotateY: 0,
      }}
      transition={{ type: "spring", stiffness: 80, damping: 18, mass: 1.2 }}
      onWheel={showRgDetail ? e => e.stopPropagation() : undefined}
      className={clsx(
        "rounded-[32px] border relative cursor-pointer group flex flex-col transition-[filter] duration-200",
        showRgDetail ? "w-[900px] h-[640px] shrink-0" : "w-[340px]",
        shouldBlur && "blur-[3px]",
        selected
          ? isRG
            ? "bg-[#121319]/95 border-fuchsia-500/40 shadow-[0_40px_80px_-20px_rgba(217,70,239,0.25)] z-50 ring-1 ring-white/5"
            : "bg-[#121319]/95 border-emerald-500/40 shadow-[0_40px_80px_-20px_rgba(16,185,129,0.25)] z-50 ring-1 ring-white/5"
          : isCritical
            ? "bg-[#241217]/90 border-rose-500/30 shadow-[0_20px_40px_-10px_rgba(244,63,94,0.1)]"
            : "bg-[#121319]/95 border-white/[0.12] hover:border-white/25 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]"
      )}
      style={{ transformStyle: "preserve-3d", perspective: "1000px" }}
    >
      {/* Front Face */}
      <div
        className="w-full h-full relative z-20 flex flex-col rounded-[32px] overflow-hidden bg-inherit"
        style={{ backfaceVisibility: "hidden" }}
      >
        {/* Top Rim Highlight */}
        <div
          className={clsx(
            "absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent z-10 transition-opacity",
            selected ? "opacity-100" : "opacity-60"
          )}
        />
        <div className="absolute top-[1px] inset-x-10 h-24 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none z-10" />

        <div
          className={clsx(
            "flex flex-col relative z-20 w-full h-full p-8",
            !showRgDetail && "min-h-[110px]"
          )}
        >
          {/* Header */}
          <div
            className={clsx(
              "flex items-start justify-between shrink-0",
              showRgDetail ? "border-b border-white/5 pb-6 mb-6" : ""
            )}
          >
            <div className="flex items-start gap-5">
              <div
                className={clsx(
                  "w-[60px] h-[60px] rounded-[20px] border flex items-center justify-center shrink-0 transition-all duration-500 shadow-inner relative",
                  selected
                    ? isRG
                      ? "bg-fuchsia-500/10 border-fuchsia-500/30"
                      : "bg-emerald-500/10 border-emerald-500/30"
                    : isCritical
                      ? "bg-rose-500/10 border-rose-500/20"
                      : "bg-white/[0.03] border-white/10 group-hover:border-white/20"
                )}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50 rounded-[20px]" />
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={clsx(
                    "relative z-10 filter drop-shadow-[0_0_10px_currentColor]",
                    isCritical ? "text-rose-400" : isRG ? "text-fuchsia-400" : "text-emerald-400"
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

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 mb-1.5 font-black uppercase tracking-[0.2em] text-[11px]">
                  <span className={isCritical ? "text-rose-500" : "text-slate-500"}>
                    AGENT PROTOCOL
                  </span>
                  <span className="text-slate-700">•</span>
                  <span className="text-slate-500">v1.2</span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight leading-none mb-3">
                  {label}
                </h3>

                {showRgDetail ? (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10">
                      <Box className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-medium text-slate-300">
                        {rgDetails.model ? String(rgDetails.model) : model || "Unknown model"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/10">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-xs font-medium text-slate-300">
                        {toolsCount} tool{toolsCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {rgConfig?.overrideSummary && rgConfig.overrideSummary !== "No overrides" && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fuchsia-500/10 border border-fuchsia-500/20">
                        <span className="text-xs font-medium text-fuchsia-300">
                          Override active
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 font-mono font-bold tracking-widest uppercase opacity-60">
                    {model || "agent-production-env"}
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
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-5 shrink-0">
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
                              <span className="text-[13px] font-semibold text-slate-200 tracking-wide group-hover/check:text-white transition-colors truncate">
                                {card.label}
                              </span>
                            </div>
                            {card.params ? (
                              <div className="pl-[26px]">
                                <span className="text-xs font-mono text-slate-500 bg-white/[0.03] px-2 py-1 rounded-md line-clamp-2">
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
                          <span className="text-[13px] font-semibold text-slate-200 tracking-wide truncate">
                            {name.replace(/_/g, " ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500 bg-white/[0.02] p-4 rounded-xl border border-white/5 border-dashed">
                      No active checks configured.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column: JSON Editor */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
                    JSON Payload
                  </div>
                  {configSourceLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-slate-300">
                      {configSourceLabel}
                    </span>
                  ) : null}
                </div>

                <div className="flex-1 rounded-2xl border border-white/10 bg-[#0a0c10] shadow-inner overflow-hidden flex flex-col p-5">
                  <pre className="flex-1 overflow-auto text-[13px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-words custom-scrollbar">
                    {String(rgConfig.originalPayloadPreview || "{}")}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Footer (Release Gate) */}
          {showRgDetail && rgConfig && (
            <div className="mt-6 pt-5 border-t border-white/10 shrink-0 flex items-center justify-between gap-4">
              {/* Footer Left: Messages & Status */}
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <span className="text-sm font-medium text-slate-400 shrink-0">
                  {baselineSummaryText}
                </span>

                {lastRunStatusLabel && (
                  <span
                    className={clsx(
                      "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border shrink-0",
                      lastRunStatusLabel === "Passed" &&
                        "text-emerald-300 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
                      (lastRunStatusLabel === "Failed" || lastRunStatusLabel === "Canceling") &&
                        "text-rose-300 border-rose-500/30 bg-rose-500/10 shadow-[0_0_10px_rgba(244,63,94,0.1)]",
                      lastRunStatusLabel === "Running" &&
                        "text-indigo-300 border-indigo-500/30 bg-indigo-500/10 shadow-[0_0_10px_rgba(99,102,241,0.1)]",
                      !["Passed", "Failed", "Running", "Canceling"].includes(lastRunStatusLabel) &&
                        "text-slate-400 border-white/10 bg-white/5"
                    )}
                  >
                    {lastRunStatusLabel}
                    {rgConfig?.lastRunWallMs
                      ? ` (${(rgConfig.lastRunWallMs / 1000).toFixed(1)}s)`
                      : ""}
                  </span>
                )}

                {startBlockedReason ? (
                  <span className="text-[13px] font-medium text-amber-400/90 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 truncate">
                    {startBlockedReason}
                  </span>
                ) : runError ? (
                  <div
                    className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-[13px] font-medium text-rose-200 truncate"
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
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-black uppercase transition",
                      rgConfig.isHeavyRepeat
                        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                        : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.08]",
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
                            className={clsx(
                              "flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold transition",
                              isActive && "bg-fuchsia-500/20 text-fuchsia-100",
                              !isActive && !heavy && "text-slate-200 hover:bg-white/[0.05]",
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
