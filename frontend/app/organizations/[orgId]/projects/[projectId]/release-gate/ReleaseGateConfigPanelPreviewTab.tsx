"use client";

import React from "react";
import { SearchCode } from "lucide-react";

import { formatProviderLabel } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateConfigPanelPreviewTabProps } from "./releaseGateConfigPanelModel.types";

export function ReleaseGateConfigPanelPreviewTab({
  m,
}: {
  m: ReleaseGateConfigPanelPreviewTabProps;
}) {
  const {
    setShowExpandedCandidatePreview,
    validateOverridePreview,
    selectedBaselineCount,
    representativeBaselineId,
    usingModel,
    usingProvider,
    candidateRequestOverview,
    toolsList,
    parityEnvironmentNotes,
    parityCandidateShapeNotes,
    finalCandidateJson,
  } = m;

  const toolReviewItems = toolsList.filter(tool => {
    const toolType = tool.toolType ?? "retrieval";
    const expectedFields =
      toolType === "action" ? tool.expectedActionFields ?? [] : tool.expectedResultFields ?? [];
    const hasExpectedFields = expectedFields.some(field => field.name.trim() || field.description.trim());
    const hasBaselineSample = (tool.baselineSampleSummary ?? "").trim().length > 0;
    const hasNotes = (tool.resultGuide ?? "").trim().length > 0;
    return hasExpectedFields || hasBaselineSample || hasNotes;
  });

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0f1115] overflow-hidden flex flex-col shadow-inner">
      <div className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
            Final override payload
          </div>
          <div className="text-base font-semibold text-white">After overrides</div>
        </div>
        <button
          type="button"
          onClick={() => setShowExpandedCandidatePreview(true)}
          disabled={!validateOverridePreview}
          className="shrink-0 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Expand full JSON
        </button>
      </div>
      {selectedBaselineCount > 1 && representativeBaselineId ? (
        <div className="border-b border-white/5 px-5 py-3 text-xs text-slate-400">
          Representative preview uses log #{representativeBaselineId} (newest by default, or your
          pick above). The candidate run still applies to all selected logs.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/5">
        <div className="bg-[#0f1115] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
            Using model
          </div>
          <div className="text-sm font-mono text-slate-200 truncate">
            {usingModel || "Not specified"}
          </div>
        </div>
        <div className="bg-[#0f1115] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
            Using provider
          </div>
          <div className="text-sm text-slate-200">{formatProviderLabel(usingProvider)}</div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-4 rounded-xl border border-white/5 bg-[#0a0c10] p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <SearchCode className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300/90">
                Candidate shape summary
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Overview of the request payload structure
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
                Messages
              </div>
              <div className="text-xl font-bold text-slate-200">
                {candidateRequestOverview.messageCount}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
                Tools
              </div>
              <div className="text-xl font-bold text-slate-200">
                {candidateRequestOverview.toolsCount}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
                Ext. Keys
              </div>
              <div className="text-xl font-bold text-slate-200">
                {candidateRequestOverview.extendedContextKeys.length || "0"}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
                Add. Keys
              </div>
              <div className="text-xl font-bold text-slate-200">
                {candidateRequestOverview.additionalRequestKeys.length || "0"}
              </div>
            </div>
          </div>
          {parityEnvironmentNotes.length > 0 || parityCandidateShapeNotes.length > 0 ? (
            <div className="mt-3 space-y-2">
              {parityEnvironmentNotes.length > 0 ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
                  <div className="font-bold uppercase tracking-[0.15em] text-amber-300">
                    Capture / environment
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {parityEnvironmentNotes.map(note => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                </div>
              ) : null}
              {parityCandidateShapeNotes.length > 0 ? (
                <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-3 text-xs text-sky-100">
                  <div className="font-bold uppercase tracking-[0.15em] text-sky-300">
                    Candidate shape (may be intentional)
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {parityCandidateShapeNotes.map(note => (
                      <div key={note}>{note}</div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : selectedBaselineCount > 0 ? (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-100">
              Candidate replay still includes the key request shape detected on the baseline node
              call.
            </div>
          ) : null}
          {toolReviewItems.length > 0 ? (
            <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-3 text-xs text-cyan-100">
              <div className="font-bold uppercase tracking-[0.15em] text-cyan-300">
                Tool review
              </div>
              <div className="mt-2 space-y-3">
                {toolReviewItems.map(tool => {
                  const toolType = tool.toolType ?? "retrieval";
                  const expectedFields =
                    toolType === "action"
                      ? tool.expectedActionFields ?? []
                      : tool.expectedResultFields ?? [];
                  const visibleFields = expectedFields.filter(
                    field => field.name.trim() || field.description.trim()
                  );
                  const baselineSampleSummary = tool.baselineSampleSummary?.trim();
                  const resultGuide = tool.resultGuide?.trim();
                  return (
                    <div
                      key={tool.id}
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
                    >
                      <div className="font-semibold text-cyan-200">
                        {tool.name.trim() || "Unnamed tool"}{" "}
                        <span className="font-normal text-cyan-100/80">
                          {toolType === "action"
                            ? "Tool that sends or updates"
                            : "Tool that fetches info"}
                        </span>
                      </div>
                      {visibleFields.length > 0 ? (
                        <div className="mt-2">
                          <div className="font-semibold text-cyan-100/85">
                            {toolType === "action"
                              ? "Sent or created fields"
                              : "Info returned"}
                          </div>
                          <div className="mt-1 space-y-1">
                            {visibleFields.map(field => (
                              <div key={field.id}>
                                <span className="font-semibold text-cyan-100">
                                  {field.name.trim() || "Unnamed field"}
                                </span>
                                {field.description.trim() ? `: ${field.description.trim()}` : ""}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {baselineSampleSummary ? (
                        <div className="mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.08] px-2.5 py-2 text-emerald-100/90">
                          <div className="mb-1 font-semibold text-emerald-200">Baseline example</div>
                          <div className="whitespace-pre-wrap break-words">
                            {baselineSampleSummary}
                          </div>
                        </div>
                      ) : null}
                      {resultGuide ? (
                        <div className="mt-2 text-fuchsia-100/90">
                          <span className="font-semibold text-fuchsia-200">Optional notes:</span>{" "}
                          {resultGuide}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        {validateOverridePreview ? (
          <div className="relative group">
            <div className="absolute top-0 right-0 p-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                className="bg-[#0f1115]/80 backdrop-blur-sm border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center gap-1.5"
                onClick={() => navigator.clipboard.writeText(finalCandidateJson)}
                title="Copy to clipboard"
              >
                Copy JSON
              </button>
            </div>
            <pre className="min-h-[160px] max-h-[min(360px,45vh)] rounded-xl border border-white/5 bg-[#0a0c10] p-4 pt-5 text-[12px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all overflow-auto custom-scrollbar shadow-inner">
              {finalCandidateJson}
            </pre>
          </div>
        ) : (
          <div className="min-h-[160px] max-h-[min(360px,45vh)] rounded-xl border border-white/5 border-dashed bg-[#0a0c10]/50 p-8 flex flex-col items-center justify-center text-center">
            <SearchCode className="w-8 h-8 text-slate-500 mb-3 opacity-50" />
            <div className="text-sm font-medium text-slate-300 mb-1">Preview not available</div>
            <div className="text-xs text-slate-500 max-w-[280px]">
              {selectedBaselineCount === 0
                ? "Select a baseline on the main screen to build a preview payload."
                : "No override payload available yet. Adjust Core setup, then check again."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
