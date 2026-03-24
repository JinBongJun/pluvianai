"use client";

import React from "react";
import clsx from "clsx";
import { SearchCode, X } from "lucide-react";

import { stringifyJson } from "./releaseGateConfigPanelHelpers";
import { ReleaseGateConfigPanelBaselineColumn } from "./ReleaseGateConfigPanelBaselineColumn";
import { ReleaseGateConfigPanelCoreTab } from "./ReleaseGateConfigPanelCoreTab";
import { ReleaseGateConfigPanelParityTab } from "./ReleaseGateConfigPanelParityTab";
import { ReleaseGateConfigPanelPreviewTab } from "./ReleaseGateConfigPanelPreviewTab";
import { ClientPortal } from "@/components/shared/ClientPortal";
import { useReleaseGateConfigPanelModel } from "./useReleaseGateConfigPanelModel";

export function ReleaseGateConfigPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const m = useReleaseGateConfigPanelModel(isOpen);

  if (!isOpen) return null;

  const {
    selectedBaselineCount,
    runLocked,
    configTab,
    setConfigTab,
    showRawBaseline,
    setShowRawBaseline,
    baselinePayload,
    showExpandedCandidatePreview,
    setShowExpandedCandidatePreview,
    validateOverridePreview,
    finalCandidateJson,
  } = m;

  return (
    <ClientPortal>
      <div
        className="fixed inset-0 z-[10002] flex items-start justify-center overflow-y-auto overscroll-y-contain bg-black/70 p-6 pt-16 pb-20 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="w-full max-w-[1400px] rounded-[28px] border border-white/10 bg-[#0a0c10] shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-labelledby="release-gate-config-title"
        >
          <div className="flex items-center justify-between border-b border-white/5 px-8 py-6 shrink-0 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div>
              <h2
                id="release-gate-config-title"
                className="text-2xl font-bold tracking-tight text-white"
              >
                Release Gate configuration
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Choose a baseline, tune the candidate on the tabs, then open Preview to verify the final request
                payload.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl border border-white/10 text-slate-400 bg-white/[0.02] hover:bg-white/10 hover:text-white transition-all duration-200"
              title="Close settings"
              aria-label="Close Release Gate settings"
            >
              <X className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-y-contain p-8 custom-scrollbar">
            <div className="flex flex-col gap-6">
              {selectedBaselineCount === 0 && (
                <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/90 font-medium flex items-center gap-3">
                  <SearchCode className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>
                    No baseline data selected. First, send traffic to Live View, then choose baseline snapshots
                    from Live Logs or Saved Data before running a Release Gate.
                  </span>
                </div>
              )}

              <div className="grid gap-8 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
                <ReleaseGateConfigPanelBaselineColumn m={m} />

                <section className="min-w-0 space-y-4 pb-8">
                  {!runLocked && selectedBaselineCount === 0 ? (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                      You can tune candidate settings now, but Release Gate needs at least one baseline snapshot on
                      the main screen before you can run a real validation.
                    </div>
                  ) : null}

                  <div
                    className="flex flex-wrap gap-2 border-b border-white/10 pb-3"
                    role="tablist"
                    aria-label="Release Gate setup sections"
                  >
                    {(
                      [
                        { id: "core" as const, label: "Core setup" },
                        { id: "parity" as const, label: "Environment parity" },
                        { id: "preview" as const, label: "Preview" },
                      ] as const
                    ).map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={configTab === tab.id}
                        id={`rg-config-tab-${tab.id}`}
                        onClick={() => setConfigTab(tab.id)}
                        className={clsx(
                          "rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/60",
                          configTab === tab.id
                            ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-100"
                            : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div
                    role="tabpanel"
                    id={`rg-config-panel-${configTab}`}
                    aria-labelledby={`rg-config-tab-${configTab}`}
                    className="space-y-6"
                  >
                    {configTab === "preview" ? <ReleaseGateConfigPanelPreviewTab m={m} /> : null}
                    {configTab === "core" ? <ReleaseGateConfigPanelCoreTab m={m} /> : null}
                    {configTab === "parity" ? <ReleaseGateConfigPanelParityTab m={m} /> : null}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRawBaseline && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-[24px] border border-white/10 bg-[#0a0c10] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
              <h3 className="text-xl font-bold text-white tracking-tight">Raw Baseline Payload</h3>
              <button
                type="button"
                onClick={() => setShowRawBaseline(false)}
                className="rounded-xl border border-white/10 p-2.5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                aria-label="Close raw baseline payload"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-[#0a0c10] custom-scrollbar">
              <pre className="text-[13px] font-mono leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                {stringifyJson(baselinePayload ?? {})}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showExpandedCandidatePreview && validateOverridePreview ? (
        <div className="fixed inset-0 z-[10100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-[24px] border border-white/10 bg-[#0a0c10] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-6 py-5">
              <h3 className="text-xl font-bold text-white tracking-tight">Final candidate payload (full)</h3>
              <button
                type="button"
                onClick={() => setShowExpandedCandidatePreview(false)}
                className="rounded-xl border border-white/10 p-2.5 text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                aria-label="Close full candidate payload"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-[#0a0c10] custom-scrollbar">
              <pre className="text-[13px] font-mono leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                {finalCandidateJson}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </ClientPortal>
  );
}
