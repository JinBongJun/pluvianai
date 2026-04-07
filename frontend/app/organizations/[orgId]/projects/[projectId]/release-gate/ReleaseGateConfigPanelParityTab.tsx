"use client";

import React from "react";
import { Loader2, Plus, RefreshCcw, Trash2, Upload } from "lucide-react";

import { getToolParametersError } from "./releaseGateConfigPanelHelpers";
import { ReleaseGateConfigPanelCollapsible as CollapsiblePanel } from "./ReleaseGateConfigPanelCollapsible";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import type { ReleaseGateConfigPanelParityTabProps } from "./releaseGateConfigPanelModel.types";

export function ReleaseGateConfigPanelParityTab({
  m,
}: {
  m: ReleaseGateConfigPanelParityTabProps;
}) {
  const {
    parityOpenTools,
    setParityOpenTools,
    toolsSummarySubtitle,
    baselinePayload,
    candidateJsonValue,
    editsLocked,
    requestBody,
    updateRequestNumberField,
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
    importBaselineToolSamples,
    handleRequestJsonBlur,
    handleResetJsonToBaseline,
    toolContextLoadBusy,
    handleLoadToolContextFromSnapshots,
    isJsonModified,
    toolContextMode,
    setToolContextMode,
    toolContextScope,
    setToolContextScope,
    toolContextGlobalText,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    toolContextBySnapshotId,
    parityOpenRawJson,
    setParityOpenRawJson,
    parityOpenRecordedToolCalls,
    setParityOpenRecordedToolCalls,
    recordedCallsSummarySubtitle,
    snapshotIdForBaselineTimeline,
    baselineTimelineLoading,
    baselineToolTimelineRows,
    resetParitySharedOverridesToBaseline,
    resetParityPerLogOverridesToBaseline,
    resetParityToolContextToBaseline,
    getSnapshotParityLabel,
    requestJsonError,
    setRequestJsonDraft,
    toolContextFileInputRef,
    onToolContextFileChange,
    triggerToolContextFilePick,
  } = m;
  const [openToolSchemas, setOpenToolSchemas] = React.useState<Record<string, boolean>>({});

  const updateExpectedField = (
    toolId: string,
    fieldKind: "expectedResultFields" | "expectedActionFields",
    fieldId: string,
    patch: { name?: string; description?: string }
  ) => {
    const tool = toolsList.find(item => item.id === toolId);
    if (!tool) return;
    const currentFields = [...(tool[fieldKind] ?? [])];
    updateTool(toolId, {
      [fieldKind]: currentFields.map(field => (field.id === fieldId ? { ...field, ...patch } : field)),
    });
  };

  const addExpectedField = (toolId: string, fieldKind: "expectedResultFields" | "expectedActionFields") => {
    const tool = toolsList.find(item => item.id === toolId);
    if (!tool) return;
    const currentFields = [...(tool[fieldKind] ?? [])];
    updateTool(toolId, {
      [fieldKind]: [...currentFields, { id: crypto.randomUUID(), name: "", description: "" }],
    });
  };

  const removeExpectedField = (
    toolId: string,
    fieldKind: "expectedResultFields" | "expectedActionFields",
    fieldId: string
  ) => {
    const tool = toolsList.find(item => item.id === toolId);
    if (!tool) return;
    const currentFields = [...(tool[fieldKind] ?? [])];
    updateTool(toolId, {
      [fieldKind]: currentFields.filter(field => field.id !== fieldId),
    });
  };

  return (
    <>
      <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-500">
        Use this tab only when replay needs more than the core setup.
      </p>

      <CollapsiblePanel
        title="Allowed tools"
        subtitle={toolsSummarySubtitle}
        open={parityOpenTools}
        onToggle={() => setParityOpenTools(o => !o)}
      >
        <p className="mb-4 text-sm text-slate-400">
          Baseline tools appear here automatically when captured. You can still edit them for the
          candidate run.
        </p>
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => importBaselineToolSamples?.()}
            disabled={editsLocked || baselineToolTimelineRows.length === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Import baseline samples
          </button>
          <button
            type="button"
            onClick={() => addTool("retrieval")}
            disabled={editsLocked}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add retrieval tool
          </button>
          <button
            type="button"
            onClick={() => addTool("action")}
            disabled={editsLocked}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Add action tool
          </button>
        </div>

        {toolsList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-5 py-8 text-center text-sm text-slate-500">
            No baseline tools were captured. Add tools only if the candidate run should allow
            them.
          </div>
        ) : (
          <div className="space-y-4">
            {toolsList.map((tool, index) => {
              const parametersError = getToolParametersError(tool.parameters);
              const toolType = tool.toolType ?? "retrieval";
              const expectedFieldKey =
                toolType === "action" ? "expectedActionFields" : "expectedResultFields";
              const expectedFields = tool[expectedFieldKey] ?? [];
              const schemaOpen = openToolSchemas[tool.id] ?? false;
              return (
                <div key={tool.id} className="rounded-xl border border-white/10 bg-[#0a0c10] p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="bg-white/10 text-slate-300 w-5 h-5 rounded flex items-center justify-center text-xs">
                        {index + 1}
                      </span>
                      {toolType === "action" ? "Action tool" : "Retrieval tool"}
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
                        What it does
                      </span>
                      <input
                        value={tool.description}
                        onChange={e => updateTool(tool.id, { description: e.target.value })}
                        disabled={editsLocked}
                        placeholder="What this tool does"
                        className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                      />
                    </label>
                    <label className="space-y-2 md:col-span-2">
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                        Tool type
                      </span>
                      <select
                        value={toolType}
                        onChange={e =>
                          updateTool(tool.id, {
                            toolType: e.target.value as "retrieval" | "action",
                            expectedResultFields:
                              e.target.value === "retrieval"
                                ? tool.expectedResultFields?.length
                                  ? tool.expectedResultFields
                                  : [{ id: crypto.randomUUID(), name: "", description: "" }]
                                : tool.expectedResultFields ?? [],
                            expectedActionFields:
                              e.target.value === "action"
                                ? tool.expectedActionFields?.length
                                  ? tool.expectedActionFields
                                  : [{ id: crypto.randomUUID(), name: "", description: "" }]
                                : tool.expectedActionFields ?? [],
                          })
                        }
                        disabled={editsLocked}
                        className="w-full rounded-xl border border-white/10 bg-[#0f1115] px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                      >
                        <option value="retrieval">Retrieval</option>
                        <option value="action">Action</option>
                      </select>
                    </label>
                  </div>

                  <div className="space-y-4">
                    {tool.baselineSampleSummary?.trim() ? (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300/90">
                          Baseline sample
                        </div>
                        <div className="mt-2 text-xs leading-relaxed text-emerald-100/90 whitespace-pre-wrap break-words">
                          {tool.baselineSampleSummary.trim()}
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-xl border border-white/10 bg-[#0f1115] p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                            {toolType === "action" ? "Action payload" : "Returned fields"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {toolType === "action"
                              ? "List what this tool should produce or send."
                              : "List what should come back to the model."}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addExpectedField(tool.id, expectedFieldKey)}
                          disabled={editsLocked}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <Plus className="w-3 h-3" />
                          {toolType === "action" ? "Add payload field" : "Add returned field"}
                        </button>
                      </div>

                      <div className="space-y-3">
                        {expectedFields.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-white/10 bg-black/20 px-3 py-3 text-xs text-slate-500">
                            {toolType === "action" ? "No action fields yet." : "No returned fields yet."}
                          </div>
                        ) : (
                          expectedFields.map((field, fieldIndex) => (
                            <div
                              key={field.id}
                              className="rounded-lg border border-white/10 bg-black/20 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="text-xs font-semibold text-slate-300">
                                  Field {fieldIndex + 1}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeExpectedField(tool.id, expectedFieldKey, field.id)}
                                  disabled={editsLocked || expectedFields.length === 1}
                                  className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-[11px] font-medium text-rose-400/80 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Remove
                                </button>
                              </div>
                              <div className="grid gap-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                <label className="space-y-2">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                                    Field name
                                  </span>
                                  <input
                                    value={field.name}
                                    onChange={e =>
                                      updateExpectedField(tool.id, expectedFieldKey, field.id, {
                                        name: e.target.value,
                                      })
                                    }
                                    disabled={editsLocked}
                                    placeholder={toolType === "action" ? "e.g. subject" : "e.g. temperature"}
                                    className="w-full rounded-lg border border-white/10 bg-[#0a0c10] px-3 py-2 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                                  />
                                </label>
                                <label className="space-y-2">
                                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                                    Description
                                  </span>
                                  <input
                                    value={field.description}
                                    onChange={e =>
                                      updateExpectedField(tool.id, expectedFieldKey, field.id, {
                                        description: e.target.value,
                                      })
                                    }
                                    disabled={editsLocked}
                                    placeholder={
                                      toolType === "action"
                                        ? "What this field should contain"
                                        : "What information this field should return"
                                    }
                                    className="w-full rounded-lg border border-white/10 bg-[#0a0c10] px-3 py-2 text-sm text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                                  />
                                </label>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                      <label className="block space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
                          Extra notes (optional)
                        </span>
                      <textarea
                        value={tool.resultGuide ?? ""}
                        onChange={e => updateTool(tool.id, { resultGuide: e.target.value })}
                        disabled={editsLocked}
                        spellCheck={false}
                        placeholder={
                          toolType === "action"
                            ? "Add any extra notes about the payload or content this tool should produce."
                            : "Add any extra notes about the information this tool should return."
                        }
                        className="min-h-[88px] w-full rounded-xl border border-white/10 bg-[#0f1115] p-4 text-[13px] leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                      />
                    </label>

                    <div className="rounded-xl border border-white/10 bg-[#0f1115]">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenToolSchemas(prev => ({ ...prev, [tool.id]: !schemaOpen }))
                        }
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      >
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                            Inputs schema
                          </div>
                          <div className="mt-1 text-xs text-slate-500">JSON schema</div>
                        </div>
                        <div className="text-xs font-medium text-slate-400">
                          {schemaOpen ? "Hide" : "Show"}
                        </div>
                      </button>
                      {schemaOpen ? (
                        <div className="border-t border-white/10 px-4 pb-4 pt-3">
                          <textarea
                            value={tool.parameters}
                            onChange={e => updateTool(tool.id, { parameters: e.target.value })}
                            disabled={editsLocked}
                            spellCheck={false}
                            className="min-h-[160px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                          />
                          {parametersError && (
                            <div className="mt-2 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                              {parametersError}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CollapsiblePanel>

      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
        <div className="mb-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
            Sampling
          </div>
          <div className="text-sm text-slate-400">
            Leave these unchanged unless sampling itself is part of the experiment.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
              Temperature
            </span>
            <input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={typeof requestBody.temperature === "number" ? requestBody.temperature : ""}
              onChange={e => updateRequestNumberField("temperature", e.target.value)}
              disabled={editsLocked}
              className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30 transition-all"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
              Max tokens
            </span>
            <input
              type="number"
              min={1}
              step={1}
              value={typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : ""}
              onChange={e => updateRequestNumberField("max_tokens", e.target.value)}
              disabled={editsLocked}
              className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30 transition-all"
            />
          </label>
          <label className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 block">
              Top p
            </span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={typeof requestBody.top_p === "number" ? requestBody.top_p : ""}
              onChange={e => updateRequestNumberField("top_p", e.target.value)}
              disabled={editsLocked}
              className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-violet-400/40 focus:ring-1 focus:ring-violet-400/30 transition-all"
            />
          </label>
        </div>
      </div>

      <CollapsiblePanel
        title="Request context fields"
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
                Shared fields (all selected logs)
              </div>
              <div className="text-sm text-slate-400">
                Add attachments, metadata, locale, or provider request fields for replay. Use this
                for things like{" "}
                <span className="font-mono text-slate-500">attachments</span>,{" "}
                <span className="font-mono text-slate-500">documents</span>, locale, metadata, or
                provider-specific options. It does <em>not</em> replace the saved conversation
                messages. Defaults come from the representative snapshot when you select logs, and
                the per-log boxes below only show fields that <em>differ</em> from this shared JSON.
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => resetParitySharedOverridesToBaseline?.()}
                disabled={editsLocked || selectedSnapshotIdsForRun.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Reset shared
              </button>
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
          <div className="text-[10px] text-slate-500 mb-2">Shared JSON</div>
          <textarea
            value={bodyOverridesJsonValue}
            disabled={editsLocked}
            onChange={e => setBodyOverridesJsonDraft?.(e.target.value)}
            onBlur={() => handleBodyOverridesJsonBlur?.()}
            spellCheck={false}
            placeholder='{\n  "metadata": {\n    "env": "staging",\n    "channel": "web"\n  }\n}'
            className="min-h-[160px] w-full flex-1 rounded-xl border border-violet-500/20 bg-[#0a0c10] p-5 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/40 transition-all custom-scrollbar resize-y"
          />
          {bodyOverridesJsonError ? (
            <div className="mt-3 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {bodyOverridesJsonError}
            </div>
          ) : null}

          <div className="mt-6 border-t border-violet-500/15 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-300/80">
                  Per-log fields
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-[48rem]">
                  Only add fields that are different for this log. Matching values are hidden so you
                  do not edit the same thing twice. Empty{" "}
                  <code className="text-slate-400">{"{}"}</code> means use the shared fields only. Replay still applies shared fields first, then this log&apos;s fields.
                </p>
              </div>
              <button
                type="button"
                onClick={() => resetParityPerLogOverridesToBaseline?.()}
                disabled={editsLocked || selectedSnapshotIdsForRun.length === 0}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <RefreshCcw className="w-3 h-3" />
                Reset all per-log
              </button>
            </div>
            {selectedSnapshotIdsForRun.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-6 text-sm text-slate-500">
                Select run logs on the main screen to add per-log fields.
              </div>
            ) : (
              <div className="space-y-4 max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                {selectedSnapshotIdsForRun.map(sid => {
                  const { primary, idLine } = getSnapshotParityLabel(sid);
                  return (
                    <div
                      key={sid}
                      className="rounded-xl border border-violet-500/20 bg-[#0a0c10]/80 p-4"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className="text-xs font-semibold text-slate-200 truncate"
                            title={idLine}
                          >
                            {primary}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                            {idLine}
                          </div>
                        </div>
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
                        placeholder='{\n  "attachments": ["file_123"]\n}'
                        className="min-h-[100px] w-full rounded-lg border border-white/10 bg-[#080a0d] p-3 text-[12px] font-mono leading-relaxed text-slate-200 outline-none focus:border-violet-400/40 transition-all custom-scrollbar resize-y"
                      />
                      {bodyOverridesSnapshotJsonError[sid] ? (
                        <div className="mt-2 text-[11px] font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2 py-1.5">
                          {bodyOverridesSnapshotJsonError[sid]}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Missing context"
        subtitle={contextSummarySubtitle}
        open={parityOpenContext}
        onToggle={() => setParityOpenContext(o => !o)}
      >
        <div className="pt-2">
          <input
            ref={toolContextFileInputRef}
            type="file"
            accept="application/json,.json,text/plain,.txt"
            className="hidden"
            onChange={e => void onToolContextFileChange(e)}
          />
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-sm text-slate-400">
                Add only the context missing from the baseline request, such as a short tool
                result summary, docs snippet, or policy reminder.
                Per-log text is pre-filled from recorded tool results when available.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                type="button"
                onClick={() => resetParityToolContextToBaseline?.()}
                disabled={editsLocked || selectedSnapshotIdsForRun.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
                Reset context from snapshots
              </button>
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
              Use baseline only
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
              Add missing context
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
                  Per log
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      Shared extra text
                    </span>
                    <button
                      type="button"
                      onClick={() => triggerToolContextFilePick("global")}
                      disabled={editsLocked}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <Upload className="w-3 h-3" />
                      Load file
                    </button>
                  </div>
                  <textarea
                    value={toolContextGlobalText}
                    onChange={e => setToolContextGlobalText?.(e.target.value)}
                    disabled={editsLocked}
                    spellCheck={false}
                    placeholder="Paste short docs, policy notes, or tool results to include for every selected log."
                    className="min-h-[180px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                  />
                </label>
              ) : (
                <div className="space-y-4">
                  <label className="block space-y-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                      Fallback text (optional)
                    </span>
                    <span className="text-xs text-slate-500 block">
                      Used when a log has no custom text below.
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
                      {selectedSnapshotIdsForRun.map(sid => {
                        const { primary, idLine } = getSnapshotParityLabel(sid);
                        return (
                          <div key={sid} className="block space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div
                                  className="text-xs font-semibold text-slate-200 truncate"
                                  title={idLine}
                                >
                                  {primary}
                                </div>
                                <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                                  {idLine}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => triggerToolContextFilePick({ sid })}
                                disabled={editsLocked}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                <Upload className="w-3 h-3" />
                                Load file
                              </button>
                            </div>
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
                              placeholder="Extra system text for this log."
                              className="min-h-[120px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-3 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-5 text-sm text-slate-500">
              No extra text: replay uses captured request data only.
            </div>
          )}
        </div>
      </CollapsiblePanel>
      <CollapsiblePanel
        title="Recorded tool history"
        subtitle={recordedCallsSummarySubtitle}
        open={parityOpenRecordedToolCalls}
        onToggle={() => setParityOpenRecordedToolCalls(o => !o)}
        className="border-white/[0.06] bg-black/20"
      >
        <p className="mb-4 text-sm text-slate-400">
          Read-only baseline evidence from the representative snapshot.
        </p>
        {!snapshotIdForBaselineTimeline ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-5 py-8 text-center text-sm text-slate-500">
            Select baseline logs on the main screen to load recorded tool activity.
          </div>
        ) : baselineTimelineLoading ? (
          <div className="rounded-xl border border-white/10 bg-[#0a0c10] px-5 py-8 text-center text-sm text-slate-500">
            Loading recorded tool history.
          </div>
        ) : baselineToolTimelineRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-500/20 bg-amber-500/5 px-5 py-8 text-center text-sm text-slate-400">
            No tool I/O captured for this snapshot. Instrument your app or upgrade the SDK to send <span className="font-mono text-slate-300">tool_events</span> on ingest.
          </div>
        ) : (
          <ToolTimelinePanel
            variant="compact"
            title="Tool history"
            subtitle={
              snapshotIdForBaselineTimeline != null
                ? `Representative snapshot #${snapshotIdForBaselineTimeline}`
                : undefined
            }
            rows={baselineToolTimelineRows}
          />
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Raw request JSON"
        subtitle={isJsonModified ? "Advanced override active" : "No raw JSON override"}
        open={parityOpenRawJson}
        onToggle={() => setParityOpenRawJson(o => !o)}
        className="border-white/[0.06] bg-black/20"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="text-sm text-slate-400">
            Use this only when the structured controls above are not enough. Verify the final
            payload in Preview.
          </div>
          <button
            type="button"
            onClick={handleResetJsonToBaseline}
            disabled={editsLocked || !isJsonModified || !baselinePayload}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Reset to baseline
          </button>
        </div>
        <textarea
          value={candidateJsonValue}
          disabled={editsLocked}
          onChange={e => setRequestJsonDraft?.(e.target.value)}
          onBlur={() => handleRequestJsonBlur?.()}
          spellCheck={false}
          className="min-h-[220px] w-full rounded-xl border border-white/10 bg-[#0a0c10] p-5 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
        />
        {requestJsonError ? (
          <div className="mt-3 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
            {requestJsonError}
          </div>
        ) : null}
      </CollapsiblePanel>
    </>
  );
}

