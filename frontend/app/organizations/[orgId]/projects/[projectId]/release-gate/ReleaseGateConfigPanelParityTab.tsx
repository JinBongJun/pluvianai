"use client";

import React from "react";
import { Loader2, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";

import { getToolParametersError } from "./releaseGateConfigPanelHelpers";
import { ReleaseGateConfigPanelCollapsible as CollapsiblePanel } from "./ReleaseGateConfigPanelCollapsible";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import type { ReleaseGateConfigPanelModel } from "./useReleaseGateConfigPanelModel";

export function ReleaseGateConfigPanelParityTab({ m }: { m: ReleaseGateConfigPanelModel }) {
  const {
    parityOpenTools,
    setParityOpenTools,
    toolsSummarySubtitle,
    editsLocked,
    addTool,
    toolsList,
    updateTool,
    removeTool,
    parityOpenOverrides,
    setParityOpenOverrides,
    overridesSummarySubtitle,
    bodyOverridesFileInputRef,
    onBodyOverridesFileChange,
    triggerBodyOverridesFilePick,
    clearBodyOverrides,
    hasAnyBodyOverridesContent,
    bodyOverridesJsonValue,
    setBodyOverridesJsonDraft,
    handleBodyOverridesJsonBlur,
    bodyOverridesJsonError,
    selectedSnapshotIdsForRun,
    bodyOverridesSnapshotDraftRaw,
    requestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    handleBodyOverridesSnapshotBlur,
    bodyOverridesSnapshotJsonError,
    parityOpenContext,
    setParityOpenContext,
    contextSummarySubtitle,
    toolContextLoadBusy,
    handleLoadToolContextFromSnapshots,
    toolContextMode,
    setToolContextMode,
    toolContextScope,
    setToolContextScope,
    toolContextGlobalText,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    toolContextBySnapshotId,
    parityOpenTimeline,
    setParityOpenTimeline,
    timelineSummarySubtitle,
    snapshotIdForBaselineTimeline,
    baselineTimelineLoading,
    baselineToolTimelineRows,
  } = m;

  return (
    <>
      <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-500">
        Align replays with captured production traffic: tool schemas, optional extra request fields sent as{" "}
        <span className="font-mono text-slate-500">replay_overrides</span>, per-log overrides, optional injected
        system context, and read-only baseline tool activity for inspection.
      </p>

      <CollapsiblePanel
        title="Tools"
        subtitle={toolsSummarySubtitle}
        open={parityOpenTools}
        onToggle={() => setParityOpenTools(o => !o)}
      >
        <p className="mb-4 text-sm text-slate-400">
          Experiment-wide definitions (same for every selected log). Separate from config-only JSON.
        </p>
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={addTool}
            disabled={editsLocked}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Tool
          </button>
        </div>

        {toolsList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-5 py-8 text-center text-sm text-slate-500">
            No tools configured for this candidate run.
          </div>
        ) : (
          <div className="space-y-4">
            {toolsList.map((tool, index) => {
              const parametersError = getToolParametersError(tool.parameters);
              return (
                <div key={tool.id} className="rounded-xl border border-white/10 bg-[#0a0c10] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="bg-white/10 text-slate-300 w-5 h-5 rounded flex items-center justify-center text-xs">
                        {index + 1}
                      </span>
                      Tool Definition
                    </div>
                    <button
                      type="button"
                      onClick={() => removeTool(tool.id)}
                      disabled={editsLocked}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 mb-4">
                    <label className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                        Name
                      </span>
                      <input
                        value={tool.name}
                        onChange={e => updateTool(tool.id, { name: e.target.value })}
                        disabled={editsLocked}
                        placeholder="e.g. get_weather"
                        className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                        Description
                      </span>
                      <input
                        value={tool.description}
                        onChange={e => updateTool(tool.id, { description: e.target.value })}
                        disabled={editsLocked}
                        placeholder="What this tool does"
                        className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                      />
                    </label>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                      Parameters (JSON Schema)
                    </span>
                    <textarea
                      value={tool.parameters}
                      onChange={e => updateTool(tool.id, { parameters: e.target.value })}
                      disabled={editsLocked}
                      spellCheck={false}
                      className="min-h-[160px] w-full rounded-xl border border-white/10 bg-[#0f1115] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                    />
                    {parametersError && (
                      <div className="mt-2 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                        {parametersError}
                      </div>
                    )}
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Extra request fields"
        subtitle={overridesSummarySubtitle}
        open={parityOpenOverrides}
        onToggle={() => setParityOpenOverrides(o => !o)}
        className="border-violet-500/15 bg-violet-500/[0.03]"
      >
        <div className="flex flex-col pt-2">
          <input
            ref={bodyOverridesFileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={e => void onBodyOverridesFileChange(e)}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-violet-300/90 mb-1">
                Additional request fields
              </div>
              <div className="text-sm text-slate-400">
                Optional non-message fields merged into the replay request body after the configuration JSON. Sent
                as <span className="font-mono text-slate-300">replay_overrides</span> (e.g.{" "}
                <span className="font-mono text-slate-500">attachments</span>,{" "}
                <span className="font-mono text-slate-500">documents</span>, retrieval keys). Does not replace{" "}
                <span className="font-mono text-slate-500">messages</span> or user text from snapshots. Shared
                fields win over the same key from config JSON; per-log fields win over shared fields for that log
                only.
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => triggerBodyOverridesFilePick("global")}
                disabled={editsLocked}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                Load JSON file
              </button>
              <button
                type="button"
                onClick={() => {
                  if (editsLocked) return;
                  clearBodyOverrides?.();
                }}
                disabled={editsLocked || !hasAnyBodyOverridesContent}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Clear all
              </button>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 mb-2">Shared (all selected logs unless overridden below)</div>
          <textarea
            value={bodyOverridesJsonValue}
            disabled={editsLocked}
            onChange={e => setBodyOverridesJsonDraft?.(e.target.value)}
            onBlur={() => handleBodyOverridesJsonBlur?.()}
            spellCheck={false}
            placeholder='{\n  "attachments": []\n}'
            className="min-h-[160px] w-full flex-1 rounded-xl border border-violet-500/20 bg-[#0a0c10] p-5 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/40 transition-all custom-scrollbar resize-y"
          />
          {bodyOverridesJsonError ? (
            <div className="mt-3 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {bodyOverridesJsonError}
            </div>
          ) : null}

          <div className="mt-6 border-t border-violet-500/15 pt-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-300/80 mb-2">
              Per-log request fields
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Optional JSON per selected log id, merged after shared fields (
              <span className="font-mono text-slate-500">replay_overrides_by_snapshot_id</span>). Same rules and
              disallowed keys apply.
            </p>
            {selectedSnapshotIdsForRun.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-6 text-sm text-slate-500">
                Select run logs on the main screen to add per-log fields.
              </div>
            ) : (
              <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {selectedSnapshotIdsForRun.map(sid => (
                  <div key={sid} className="rounded-xl border border-violet-500/20 bg-[#0a0c10]/80 p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        Log id {sid}
                      </span>
                      <button
                        type="button"
                        onClick={() => triggerBodyOverridesFilePick({ sid })}
                        disabled={editsLocked}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <Upload className="w-3 h-3" />
                        Load file
                      </button>
                    </div>
                    <textarea
                      value={
                        bodyOverridesSnapshotDraftRaw[sid] ??
                        JSON.stringify(requestBodyOverridesBySnapshotId[sid] ?? {}, null, 2)
                      }
                      disabled={editsLocked}
                      onChange={e =>
                        setBodyOverridesSnapshotDraftRaw?.(prev => ({
                          ...prev,
                          [sid]: e.target.value,
                        }))
                      }
                      onBlur={() => handleBodyOverridesSnapshotBlur?.(sid)}
                      spellCheck={false}
                      placeholder='{ "attachments": [] }'
                      className="min-h-[100px] w-full rounded-lg border border-white/10 bg-[#080a0d] p-3 text-[12px] font-mono leading-relaxed text-slate-200 outline-none focus:border-violet-400/40 transition-all custom-scrollbar resize-y"
                    />
                    {bodyOverridesSnapshotJsonError[sid] ? (
                      <div className="mt-2 text-[11px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1.5">
                        {bodyOverridesSnapshotJsonError[sid]}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Additional system context"
        subtitle={contextSummarySubtitle}
        open={parityOpenContext}
        onToggle={() => setParityOpenContext(o => !o)}
      >
        <div className="pt-2">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm text-slate-400">
                Optional text appended to the system prompt on replay when ingest omitted tool results or customer
                content. Use recorded logs when available, or paste your own material for controlled experiments.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                disabled={
                  editsLocked ||
                  toolContextMode !== "inject" ||
                  selectedSnapshotIdsForRun.length === 0 ||
                  toolContextLoadBusy
                }
                onClick={() => void handleLoadToolContextFromSnapshots?.()}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {toolContextLoadBusy ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="w-3.5 h-3.5" />
                )}
                Load from logs
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mb-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="toolContextMode"
                checked={toolContextMode === "recorded"}
                onChange={() => setToolContextMode?.("recorded")}
                disabled={editsLocked}
                className="accent-fuchsia-500"
              />
              Recorded only
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="toolContextMode"
                checked={toolContextMode === "inject"}
                onChange={() => setToolContextMode?.("inject")}
                disabled={editsLocked}
                className="accent-fuchsia-500"
              />
              Append to system prompt
            </label>
          </div>

          {toolContextMode === "inject" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="toolContextScope"
                    checked={toolContextScope === "per_snapshot"}
                    onChange={() => setToolContextScope?.("per_snapshot")}
                    disabled={editsLocked}
                    className="accent-fuchsia-500"
                  />
                  Per log id
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="radio"
                    name="toolContextScope"
                    checked={toolContextScope === "global"}
                    onChange={() => setToolContextScope?.("global")}
                    disabled={editsLocked}
                    className="accent-fuchsia-500"
                  />
                  Shared (all selected)
                </label>
              </div>

              {toolContextScope === "global" ? (
                <label className="block space-y-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                    Shared system text
                  </span>
                  <textarea
                    value={toolContextGlobalText}
                    onChange={e => setToolContextGlobalText?.(e.target.value)}
                    disabled={editsLocked}
                    spellCheck={false}
                    placeholder="Paste docs, code, or tool outcomes to include for every selected log…"
                    className="min-h-[180px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                  />
                </label>
              ) : (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      Fallback (optional)
                    </span>
                    <span className="text-xs text-slate-500 block">
                      Used when a log id has no per-row text below.
                    </span>
                    <textarea
                      value={toolContextGlobalText}
                      onChange={e => setToolContextGlobalText?.(e.target.value)}
                      disabled={editsLocked}
                      spellCheck={false}
                      className="min-h-[80px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-3 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                    />
                  </label>
                  {selectedSnapshotIdsForRun.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-6 text-sm text-slate-500">
                      Select run logs on the main screen to edit per-log context.
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                      {selectedSnapshotIdsForRun.map(sid => (
                        <label key={sid} className="block space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                            Log id {sid}
                          </span>
                          <textarea
                            value={toolContextBySnapshotId[sid] ?? ""}
                            onChange={e =>
                              setToolContextBySnapshotId?.(prev => ({
                                ...prev,
                                [sid]: e.target.value,
                              }))
                            }
                            disabled={editsLocked}
                            spellCheck={false}
                            placeholder="Additional system context for this log…"
                            className="min-h-[120px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-3 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-5 text-sm text-slate-500">
              No extra system context: replay uses captured request data only.
            </div>
          )}
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Baseline tool activity"
        subtitle={timelineSummarySubtitle}
        open={parityOpenTimeline}
        onToggle={() => setParityOpenTimeline(o => !o)}
      >
        <div className="pt-2">
          <div className="mb-4">
            <div className="text-sm text-slate-400">
              Read-only tool I/O for the representative baseline snapshot (first selected). Matches Live View
              snapshot detail and Release Gate evidence.
            </div>
          </div>
          {!snapshotIdForBaselineTimeline ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-5 py-8 text-center text-sm text-slate-500">
              Select baseline snapshots on the main screen to load tool activity.
            </div>
          ) : baselineTimelineLoading ? (
            <div className="rounded-xl border border-white/10 bg-[#0a0c10] px-5 py-8 text-center text-sm text-slate-500">
              Loading tool timeline…
            </div>
          ) : baselineToolTimelineRows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 px-5 py-8 text-center text-sm text-slate-400">
              No tool I/O captured for this snapshot. Instrument your app or upgrade the SDK to send{" "}
              <span className="font-mono text-slate-300">tool_events</span> on ingest.
            </div>
          ) : (
            <ToolTimelinePanel
              variant="compact"
              title="Tool timeline"
              subtitle={
                snapshotIdForBaselineTimeline != null ? `Snapshot #${snapshotIdForBaselineTimeline}` : undefined
              }
              rows={baselineToolTimelineRows}
            />
          )}
        </div>
      </CollapsiblePanel>
    </>
  );
}
