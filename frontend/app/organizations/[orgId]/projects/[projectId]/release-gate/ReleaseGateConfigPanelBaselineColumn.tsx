"use client";

import React from "react";
import { SearchCode } from "lucide-react";

import { formatProviderLabel } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateConfigPanelBaselineColumnProps } from "./releaseGateConfigPanelModel.types";

export function ReleaseGateConfigPanelBaselineColumn({ m }: { m: ReleaseGateConfigPanelBaselineColumnProps }) {
  const {
    selectedBaselineCount,
    selectedDataSummary,
    runDataModel,
    runDataProvider,
    representativeBaselinePickerOptions,
    editsLocked,
    representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId,
    autoRepresentativeBaselineSnapshotId,
    representativeBaselineId,
    baselineConfigSummary,
    baselineRequestOverview,
    setShowRawBaseline,
    runDataPrompt,
    paritySummaryLines,
  } = m;

  return (
    <section className="space-y-6 xl:sticky xl:top-0 xl:self-start">
      <div className="rounded-2xl border border-white/5 bg-[#0f1115] overflow-hidden flex flex-col shadow-inner">
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 bg-white/[0.02]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
              Baseline Reference
            </div>
            <div className="text-base font-semibold text-white">Original System Prompt</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-300 font-medium">{selectedBaselineCount} selected</div>
            <div className="text-xs text-slate-500 mt-0.5">{selectedDataSummary}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/5">
          <div className="bg-[#0f1115] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
              Original Model
            </div>
            <div className="text-sm font-mono text-slate-200 truncate">
              {runDataModel || "Not detected"}
            </div>
          </div>
          <div className="bg-[#0f1115] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
              Original Provider
            </div>
            <div className="text-sm text-slate-200">{formatProviderLabel(runDataProvider)}</div>
          </div>
        </div>

        {selectedBaselineCount > 1 ? (
          <div className="border-b border-white/5 bg-white/[0.02] px-5 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-2">
              Representative preview log
            </div>
            {representativeBaselinePickerOptions.length === 0 ? (
              <p className="text-xs text-slate-500">Loading snapshot metadata...</p>
            ) : (
              <select
                disabled={editsLocked}
                value={representativeBaselineUserSnapshotId ?? ""}
                onChange={e => {
                  const v = e.target.value.trim();
                  setRepresentativeBaselineUserSnapshotId?.(v ? v : null);
                }}
                aria-label="Representative baseline log for preview"
                className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-2.5 text-xs font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/40"
              >
                <option value="">
                  Newest (auto
                  {autoRepresentativeBaselineSnapshotId ? ` · #${autoRepresentativeBaselineSnapshotId}` : ""})
                </option>
                {representativeBaselinePickerOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>
                    #{opt.id}
                    {opt.createdAt ? ` · ${opt.createdAt}` : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
              Defaults to the newest selected log. Change this only if you want a different baseline preview.
            </p>
          </div>
        ) : null}

        <div className="p-5 flex flex-col">
          {selectedBaselineCount > 1 && representativeBaselineId ? (
            <div className="mb-4 rounded-xl border border-sky-500/15 bg-sky-500/10 px-4 py-3 text-xs text-sky-100">
              Previewing baseline for log #{representativeBaselineId}. Candidate settings apply to every selected
              log.
            </div>
          ) : null}
          {baselineConfigSummary && (
            <div className="mb-3 text-[11px] text-slate-400">
              <span className="font-bold uppercase tracking-[0.15em] text-slate-500 mr-2">
                Baseline Config
              </span>
              <span className="text-[11px] text-slate-300">{baselineConfigSummary}</span>
            </div>
          )}
          <div className="mb-4 rounded-xl border border-white/5 bg-black/20 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
              Baseline Request Summary
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <div className="text-xs text-slate-400">
                Messages
                <div className="mt-1 text-sm font-semibold text-slate-200">
                  {baselineRequestOverview.messageCount}
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Tools
                <div className="mt-1 text-sm font-semibold text-slate-200">
                  {baselineRequestOverview.toolsCount}
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Request state
                <div className="mt-1 text-sm font-semibold text-slate-200">
                  {baselineRequestOverview.truncated
                    ? "Truncated"
                    : baselineRequestOverview.omittedByPolicy
                      ? "Policy-limited"
                      : "Complete"}
                </div>
              </div>
              <div className="text-xs text-slate-400">
                Sampling
                <div className="mt-1 text-sm font-semibold text-slate-200">
                  {[
                    baselineRequestOverview.temperature != null
                      ? `temp ${baselineRequestOverview.temperature}`
                      : null,
                    baselineRequestOverview.topP != null ? `top_p ${baselineRequestOverview.topP}` : null,
                    baselineRequestOverview.maxTokens != null
                      ? `max ${baselineRequestOverview.maxTokens}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Default / not captured"}
                </div>
              </div>
            </div>
            {baselineRequestOverview.extendedContextKeys.length > 0 ? (
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Extended context keys
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {baselineRequestOverview.extendedContextKeys.map(key => (
                    <span
                      key={key}
                      className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-200"
                    >
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {baselineRequestOverview.additionalRequestKeys.length > 0 ? (
              <div className="mt-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  Additional request keys
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {baselineRequestOverview.additionalRequestKeys.map(key => (
                    <span
                      key={key}
                      className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] font-semibold text-cyan-100"
                    >
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
              {selectedBaselineCount > 1
                ? "Representative Baseline Request (Preview)"
                : "Baseline Request (Preview)"}
            </div>
            {selectedBaselineCount > 0 && (
              <button
                type="button"
                onClick={() => setShowRawBaseline(true)}
                className="text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300 transition-colors"
              >
                View full raw
              </button>
            )}
          </div>

          {runDataPrompt ? (
            <pre className="min-h-[120px] max-h-[220px] rounded-xl border border-white/5 bg-[#0a0c10] p-4 text-[12px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all overflow-auto custom-scrollbar shadow-inner">
              {runDataPrompt}
            </pre>
          ) : (
            <div className="min-h-[140px] rounded-xl border border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center gap-3 text-center p-6">
              <SearchCode className="w-8 h-8 text-slate-600" />
              <div>
                <div className="text-sm font-semibold text-slate-300 mb-1">No system prompt available</div>
                <p className="text-xs text-slate-500 max-w-[260px]">
                  Select a node in Live View to populate the baseline system instruction.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 shadow-inner">
        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300/90 mb-3">
          Current setup vs baseline
        </div>
        <ul className="space-y-2.5">
          {paritySummaryLines.map(row => (
            <li
              key={row.label}
              className="flex items-start justify-between gap-3 text-xs border-b border-white/5 pb-2 last:border-0 last:pb-0"
            >
              <span className="shrink-0 font-semibold uppercase tracking-wider text-slate-500">
                {row.label}
              </span>
              <span className="text-right text-slate-200 leading-snug">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

