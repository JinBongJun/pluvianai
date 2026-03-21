"use client";

import React from "react";
import clsx from "clsx";
import { Terminal } from "lucide-react";

import type { LiveViewToolTimelineRow } from "@/lib/api/live-view";

function safeStringify(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val;
  try {
    return JSON.stringify(val, null, 2);
  } catch {
    return String(val);
  }
}

export type ToolTimelinePanelProps = {
  rows: LiveViewToolTimelineRow[];
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** snapshot: full cards; compact: tighter padding for sidebars */
  variant?: "snapshot" | "compact";
};

/**
 * Shared tool / action timeline (Live View snapshot detail, Release Gate, etc.).
 * English-only badge labels per product convention; aria-label includes provenance for a11y.
 */
export function ToolTimelinePanel({
  rows,
  title,
  subtitle,
  icon: Icon = Terminal,
  variant = "snapshot",
}: ToolTimelinePanelProps) {
  if (!rows.length) return null;

  const pad = variant === "compact" ? "p-4" : "p-6";
  const cardPad = variant === "compact" ? "p-3" : "p-4";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b border-white/5 pb-3">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-sky-400" aria-hidden />
          <span className="text-sm font-bold uppercase tracking-widest text-slate-200">{title}</span>
        </div>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      <div className={clsx("rounded-[20px] border border-white/5 bg-[#030806] shadow-inner space-y-4", pad)}>
        {rows.map((row, idx) => {
          const isAction = String(row.step_type ?? "").toLowerCase() === "action";
          const prov = row.provenance;
          const provLabel =
            prov === "trajectory" ? "Trajectory" : prov === "payload" ? "Ingest" : prov || "";
          const exec = String(row.execution_source ?? "").trim().toLowerCase();
          const gateExecLabel =
            exec === "recorded"
              ? "Recorded"
              : exec === "missing"
                ? "Missing"
                : exec === "simulated"
                  ? "Simulated"
                  : "";
          const ariaProv = gateExecLabel || provLabel || "unknown provenance";
          return (
            <div
              key={idx}
              className={clsx(
                "rounded-xl border border-white/5 bg-[#0a0a0c]",
                isAction && "border-l-2 border-l-orange-400/50",
                cardPad
              )}
              aria-label={`Tool timeline row ${idx + 1}, ${String(row.step_type)}, ${ariaProv}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={clsx(
                    "font-mono text-[10px] uppercase",
                    isAction ? "text-orange-300/95" : "text-slate-500"
                  )}
                >
                  {row.step_type}
                </span>
                {row.tool_name ? (
                  <span className="text-xs font-bold tracking-wide text-sky-400/90">{row.tool_name}</span>
                ) : null}
                {gateExecLabel ? (
                  <span
                    className={clsx(
                      "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      exec === "recorded"
                        ? "bg-violet-500/15 text-violet-200"
                        : exec === "missing"
                          ? "bg-amber-500/15 text-amber-200"
                          : "bg-slate-500/15 text-slate-300"
                    )}
                  >
                    {gateExecLabel}
                  </span>
                ) : prov ? (
                  <span
                    className={clsx(
                      "rounded px-2 py-0.5 text-[10px] uppercase",
                      prov === "trajectory"
                        ? "bg-violet-500/10 text-violet-300/90"
                        : "bg-amber-500/10 text-amber-200/80"
                    )}
                  >
                    {provLabel}
                  </span>
                ) : null}
                {row.tool_result_source ? (
                  <span className="text-[10px] text-slate-500" title="source">
                    {String(row.tool_result_source)}
                  </span>
                ) : null}
                {row.match_tier === "name_order" ? (
                  <span className="text-[10px] text-amber-200/90">Weak match</span>
                ) : null}
                {row.latency_ms != null ? (
                  <span className="text-[10px] text-slate-500">{row.latency_ms}ms</span>
                ) : null}
              </div>
              {row.tool_args && Object.keys(row.tool_args).length > 0 ? (
                <pre className="mb-2 font-mono text-xs whitespace-pre-wrap break-all text-slate-400">
                  {safeStringify(row.tool_args)}
                </pre>
              ) : null}
              {row.tool_result && Object.keys(row.tool_result).length > 0 ? (
                <pre className="font-mono text-xs whitespace-pre-wrap break-all text-emerald-300/90">
                  {safeStringify(row.tool_result)}
                </pre>
              ) : null}
              {(!row.tool_args || Object.keys(row.tool_args).length === 0) &&
              (!row.tool_result || Object.keys(row.tool_result).length === 0) ? (
                <p className="text-xs text-slate-500">
                  {exec === "missing"
                    ? "No tool input/output stored for this step (missing ingest or not recorded)."
                    : prov === "payload"
                      ? "No tool input/output in payload for this row (SDK may omit bodies; see docs)."
                      : "No tool input/output captured for this step."}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
