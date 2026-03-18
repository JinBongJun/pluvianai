"use client";

import React, { useContext, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2, X, RefreshCcw, SearchCode } from "lucide-react";

import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { sanitizePayloadForPreview } from "./ReleaseGatePageContent";
import { ClientPortal } from "@/components/shared/ClientPortal";

type ReplayProvider = "openai" | "anthropic" | "google";
type ThresholdPreset = "strict" | "default" | "lenient" | "custom";
type EditableTool = {
  id: string;
  name: string;
  description: string;
  parameters: string;
};

function formatProviderLabel(provider: ReplayProvider): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "Google";
}

function toReplayProvider(value: unknown): ReplayProvider {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "anthropic" || normalized === "google") return normalized;
  return "openai";
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function getToolParametersError(parameters: string): string {
  const trimmed = parameters.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "Parameters must be a JSON object.";
    }
    return "";
  } catch {
    return "Parameters must be valid JSON.";
  }
}

function isPinnedAnthropicModelId(modelId: string): boolean {
  // Anthropic "pinned" model ids are versioned snapshots ending in YYYYMMDD.
  return /-\d{8}$/.test(String(modelId || "").trim());
}

export function ReleaseGateConfigPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const ctx = useContext(ReleaseGatePageContext) as Record<string, unknown> | null;
  const [activeProviderTab, setActiveProviderTab] = useState<ReplayProvider>("openai");
  const [showRawBaseline, setShowRawBaseline] = useState(false);

  const REPLAY_PROVIDER_MODEL_LIBRARY = ctx?.REPLAY_PROVIDER_MODEL_LIBRARY as Record<
    ReplayProvider,
    string[]
  >;
  const REPLAY_THRESHOLD_PRESETS = ctx?.REPLAY_THRESHOLD_PRESETS as Record<
    string,
    { label: string; failRateMax: number; flakyRateMax: number }
  >;
  const thresholdPreset = (ctx?.thresholdPreset as ThresholdPreset) ?? "default";
  const setThresholdPreset = ctx?.setThresholdPreset as
    | ((value: ThresholdPreset) => void)
    | undefined;
  const normalizeGateThresholds = ctx?.normalizeGateThresholds as
    | ((
        failRateMax: unknown,
        flakyRateMax: unknown
      ) => { failRateMax: number; flakyRateMax: number })
    | undefined;
  const failRateMax = Number(ctx?.failRateMax ?? 0);
  const setFailRateMax = ctx?.setFailRateMax as ((value: number) => void) | undefined;
  const flakyRateMax = Number(ctx?.flakyRateMax ?? 0);
  const setFlakyRateMax = ctx?.setFlakyRateMax as ((value: number) => void) | undefined;
  const newModel = (ctx?.newModel as string) ?? "";
  const setNewModel = ctx?.setNewModel as ((value: string) => void) | undefined;
  const modelOverrideEnabled = Boolean(ctx?.modelOverrideEnabled);
  const setModelOverrideEnabled = ctx?.setModelOverrideEnabled as
    | ((value: boolean) => void)
    | undefined;
  const replayProvider = toReplayProvider(ctx?.replayProvider);
  const setReplayProvider = ctx?.setReplayProvider as ((value: ReplayProvider) => void) | undefined;
  const requestBody = (ctx?.requestBody as Record<string, unknown>) ?? {};
  const setRequestBody = ctx?.setRequestBody as
    | React.Dispatch<React.SetStateAction<Record<string, unknown>>>
    | undefined;
  const requestBodyJson = (ctx?.requestBodyJson as string) ?? "{}";
  const requestJsonDraft = (ctx?.requestJsonDraft as string | null) ?? null;
  const setRequestJsonDraft = ctx?.setRequestJsonDraft as
    | ((value: string | null) => void)
    | undefined;
  const requestJsonError = (ctx?.requestJsonError as string) ?? "";
  const handleRequestJsonBlur = ctx?.handleRequestJsonBlur as (() => void) | undefined;
  const applySystemPromptToBody = ctx?.applySystemPromptToBody as
    | ((body: Record<string, unknown>, systemPrompt: string) => Record<string, unknown>)
    | undefined;
  const requestSystemPrompt = (ctx?.requestSystemPrompt as string) ?? "";
  const toolsList = ((ctx?.toolsList as EditableTool[] | undefined) ?? []) as EditableTool[];
  const setToolsList = ctx?.setToolsList as
    | React.Dispatch<React.SetStateAction<EditableTool[]>>
    | undefined;
  const runDataProvider = toReplayProvider(ctx?.runDataProvider);
  const runDataModel = (ctx?.runDataModel as string) ?? "";
  const baselinePayload = (ctx?.baselinePayload as Record<string, unknown> | null) ?? null;
  const finalCandidateRequest =
    (ctx?.finalCandidateRequest as Record<string, unknown> | null) ?? null;
  const selectedBaselineCount = Number(ctx?.selectedBaselineCount ?? 0);
  const selectedDataSummary =
    (ctx?.selectedDataSummary as string) ??
    "No baseline data yet. Select representative \"good\" snapshots from Live Logs or Saved Data.";
  const runLocked = Boolean(ctx?.isValidating) || Boolean(ctx?.activeJobId);

  useEffect(() => {
    if (!isOpen) return;
    setActiveProviderTab(modelOverrideEnabled ? replayProvider : runDataProvider);
  }, [isOpen, modelOverrideEnabled, replayProvider, runDataProvider]);

  const baselinePayloadJson = useMemo(
    () => stringifyJson(sanitizePayloadForPreview(baselinePayload ?? {})),
    [baselinePayload]
  );
  const finalCandidateJson = useMemo(
    () => stringifyJson(finalCandidateRequest ?? {}),
    [finalCandidateRequest]
  );
  const candidateJsonValue = requestJsonDraft ?? requestBodyJson;

  const cleanBaselineForComparison = useMemo(() => {
    if (!baselinePayload) return "{}";
    const sanitized = sanitizePayloadForPreview(baselinePayload);
    const clean = { ...sanitized };
    delete clean.tools;
    delete (clean as any).system_prompt;
    return stringifyJson(clean);
  }, [baselinePayload]);

  const isJsonModified = candidateJsonValue !== cleanBaselineForComparison;

  const handleResetJsonToBaseline = () => {
    if (runLocked || !setRequestBody) return;
    if (!baselinePayload) return;
    const sanitized = sanitizePayloadForPreview(baselinePayload);
    const clean = { ...sanitized };
    delete clean.tools;
    delete (clean as any).system_prompt;
    setRequestBody(clean);
    setRequestJsonDraft?.(null);
  };

  const activeProviderForModel = modelOverrideEnabled ? replayProvider : runDataProvider;
  const pinnedBadge =
    modelOverrideEnabled &&
    activeProviderForModel === "anthropic" &&
    isPinnedAnthropicModelId(newModel)
      ? "Pinned"
      : modelOverrideEnabled
        ? "Custom"
        : null;
  const showCustomModelWarning =
    modelOverrideEnabled &&
    activeProviderForModel === "anthropic" &&
    newModel.trim().length > 0 &&
    (!isPinnedAnthropicModelId(newModel) || newModel.toLowerCase().includes("latest"));

  const updateRequestNumberField = (
    key: "temperature" | "max_tokens" | "top_p",
    rawValue: string
  ) => {
    if (runLocked) return;
    if (!setRequestBody) return;
    setRequestBody(prev => {
      const next = { ...prev };
      const trimmed = rawValue.trim();
      if (!trimmed) {
        delete next[key];
        return next;
      }
      const parsed = key === "max_tokens" ? Number.parseInt(trimmed, 10) : Number(trimmed);
      if (!Number.isFinite(parsed)) return next;
      next[key] = parsed;
      return next;
    });
  };

  const updateTool = (toolId: string, patch: Partial<EditableTool>) => {
    if (runLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => prev.map(tool => (tool.id === toolId ? { ...tool, ...patch } : tool)));
  };

  const addTool = () => {
    if (runLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        parameters: '{\n  "type": "object",\n  "properties": {}\n}',
      },
    ]);
  };

  const removeTool = (toolId: string) => {
    if (runLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => prev.filter(tool => tool.id !== toolId));
  };

  if (!isOpen || !ctx) return null;

  return (
    <ClientPortal>
      <div
        className="fixed inset-0 z-[10002] flex items-start justify-center overflow-y-auto bg-black/70 p-6 pt-16 pb-20 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="w-full max-w-[1400px] rounded-[28px] border border-white/10 bg-[#0a0c10] shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-labelledby="release-gate-config-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/5 px-8 py-6 shrink-0 relative">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div>
              <h2
                id="release-gate-config-title"
                className="text-2xl font-bold tracking-tight text-white"
              >
                Candidate Overrides
              </h2>
              <p className="mt-1.5 text-sm text-slate-400">
                Compare the original payload on the left with your candidate configuration on the
                right.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2.5 rounded-xl border border-white/10 text-slate-400 bg-white/[0.02] hover:bg-white/10 hover:text-white transition-all duration-200"
              title="Close settings"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.8fr)] items-start">
              {/* Left Column: Baseline */}
              <section className="sticky top-0 space-y-6">
                {selectedBaselineCount === 0 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/90 font-medium flex items-center gap-3">
                    <SearchCode className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>
                      No baseline data selected. First, send traffic to Live View, then choose
                      baseline snapshots from Live Logs or Saved Data before running a Release Gate.
                    </span>
                  </div>
                )}

                <div className="rounded-2xl border border-white/5 bg-[#0f1115] overflow-hidden flex flex-col shadow-inner">
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 bg-white/[0.02]">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
                        Baseline Reference
                      </div>
                      <div className="text-base font-semibold text-white">Original Payload</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-300 font-medium">
                        {selectedBaselineCount} selected
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{selectedDataSummary}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-px bg-white/5 border-b border-white/5">
                    <div className="bg-[#0f1115] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
                        Detected Model
                      </div>
                      <div className="text-sm font-mono text-slate-200 truncate">
                        {runDataModel || "Not detected"}
                      </div>
                    </div>
                    <div className="bg-[#0f1115] p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1.5">
                        Detected Provider
                      </div>
                      <div className="text-sm text-slate-200">
                        {formatProviderLabel(runDataProvider)}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        Baseline Request (Preview)
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

                    {selectedBaselineCount === 0 ? (
                      <div className="min-h-[300px] rounded-xl border border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center gap-3 text-center p-6">
                        <SearchCode className="w-8 h-8 text-slate-600" />
                        <div>
                          <div className="text-sm font-semibold text-slate-300 mb-1">
                            No baseline available
                          </div>
                          <p className="text-xs text-slate-500 max-w-[200px]">
                            Select data to preview the original request payload here.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <pre className="min-h-[400px] max-h-[600px] rounded-xl border border-white/5 bg-[#0a0c10] p-5 text-[13px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all overflow-auto custom-scrollbar shadow-inner">
                        {baselinePayload
                          ? baselinePayloadJson
                          : "No baseline payload available yet."}
                      </pre>
                    )}
                  </div>
                </div>
              </section>

              {/* Middle Column: Final Candidate Request */}
              <section className="space-y-6">
                <div className="rounded-2xl border border-white/5 bg-[#0f1115] overflow-hidden flex flex-col shadow-inner">
                  <div className="flex items-center justify-between border-b border-white/5 px-5 py-4 bg-white/[0.02]">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 mb-1">
                        Candidate Request
                      </div>
                      <div className="text-base font-semibold text-white">After Overrides</div>
                    </div>
                    <div className="text-xs text-slate-500 max-w-xs text-right">
                      This JSON shows how your overrides will be applied to the original request.
                    </div>
                  </div>

                  <div className="p-5">
                    <pre className="min-h-[400px] max-h-[600px] rounded-xl border border-white/5 bg-[#0a0c10] p-5 text-[13px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all overflow-auto custom-scrollbar shadow-inner">
                      {finalCandidateRequest
                        ? finalCandidateJson
                        : "No candidate request available yet. Select a node and baseline, then adjust overrides on the right."}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Right Column: Candidate Overrides */}
              <section className="space-y-6 pb-8">
                {modelOverrideEnabled && (
                  <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-5 py-4 text-sm text-fuchsia-200 font-medium">
                    Platform-provided model mode is active. Personal provider key is not required
                    for this run.
                  </div>
                )}

                {/* Strictness */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
                        Strictness
                      </div>
                      <div className="text-base font-semibold text-white">
                        Release Gate Thresholds
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>
                        Fail max:{" "}
                        <span className="text-slate-200 font-medium">
                          {Math.round(failRateMax * 100)}%
                        </span>
                      </div>
                      <div>
                        Flaky max:{" "}
                        <span className="text-slate-200 font-medium">
                          {Math.round(flakyRateMax * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {(
                      Object.keys(REPLAY_THRESHOLD_PRESETS) as Array<
                        keyof typeof REPLAY_THRESHOLD_PRESETS
                      >
                    ).map(key => {
                      const preset = REPLAY_THRESHOLD_PRESETS[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setThresholdPreset?.(key as ThresholdPreset);
                            if (key !== "custom" && normalizeGateThresholds) {
                              const normalized = normalizeGateThresholds(
                                preset.failRateMax,
                                preset.flakyRateMax
                              );
                              setFailRateMax?.(normalized.failRateMax);
                              setFlakyRateMax?.(normalized.flakyRateMax);
                            }
                          }}
                          className={clsx(
                            "rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-all",
                            thresholdPreset === key
                              ? "border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-100 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                              : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:bg-white/[0.06]"
                          )}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>

                  {thresholdPreset === "custom" && (
                    <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-white/5">
                      <label className="space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
                          Fail %
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Number.isFinite(failRateMax) ? Math.round(failRateMax * 100) : 0}
                          onChange={e => {
                            const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            setThresholdPreset?.("custom");
                            setFailRateMax?.(next / 100);
                          }}
                          className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
                          Flaky %
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          value={Number.isFinite(flakyRateMax) ? Math.round(flakyRateMax * 100) : 0}
                          onChange={e => {
                            const next = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                            setThresholdPreset?.("custom");
                            setFlakyRateMax?.(next / 100);
                          }}
                          className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm text-slate-100 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Model Settings */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
                        Model Settings
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-base font-semibold text-white">
                          {modelOverrideEnabled
                            ? newModel || "Not specified"
                            : runDataModel || "Not detected"}
                        </div>
                        {pinnedBadge && (
                          <span
                            className={clsx(
                              "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]",
                              pinnedBadge === "Pinned"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20"
                                : "bg-amber-500/15 text-amber-300 border border-amber-500/20"
                            )}
                            title={
                              pinnedBadge === "Pinned"
                                ? "Pinned model id (versioned) — best for reproducible gates."
                                : "Custom model id — may reduce reproducibility."
                            }
                          >
                            {pinnedBadge}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-400">
                      <div>
                        Provider:{" "}
                        <span className="text-slate-200">
                          {modelOverrideEnabled
                            ? formatProviderLabel(replayProvider)
                            : formatProviderLabel(runDataProvider)}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        {modelOverrideEnabled ? (
                          <span className="text-fuchsia-300">Override active</span>
                        ) : (
                          "Using detected model"
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex w-fit rounded-xl border border-white/10 bg-[#0a0c10] p-1 mb-4">
                    {(Object.keys(REPLAY_PROVIDER_MODEL_LIBRARY || {}) as ReplayProvider[]).map(
                      provider => {
                        const isActive = activeProviderTab === provider;
                        return (
                          <button
                            key={provider}
                            type="button"
                            onClick={() => setActiveProviderTab(provider)}
                            className={clsx(
                              "rounded-lg px-5 py-2 text-xs font-semibold transition-all duration-200",
                              isActive
                                ? "bg-white/10 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                            )}
                          >
                            {formatProviderLabel(provider)}
                          </button>
                        );
                      }
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {(REPLAY_PROVIDER_MODEL_LIBRARY?.[activeProviderTab] || []).map(modelId => (
                      <button
                        key={modelId}
                        type="button"
                        disabled={runLocked}
                        onClick={() => {
                          if (runLocked) return;
                          setReplayProvider?.(activeProviderTab);
                          setNewModel?.(modelId);
                          setModelOverrideEnabled?.(true);
                        }}
                        className={clsx(
                          "rounded-xl border px-4 py-3.5 text-left text-[13px] font-mono transition-all duration-200",
                          newModel === modelId && replayProvider === activeProviderTab
                            ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-100 shadow-[0_0_15px_rgba(217,70,239,0.15)]"
                            : "border-white/10 bg-[#0a0c10] text-slate-300 hover:border-white/20 hover:bg-white/[0.04]"
                        )}
                      >
                        {modelId}
                      </button>
                    ))}
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 block">
                        Custom model ID{" "}
                        <span className="text-slate-500 font-normal lowercase tracking-normal ml-1">
                          (Advanced)
                        </span>
                      </div>
                    </div>
                    <input
                      value={newModel}
                      disabled={runLocked}
                      onChange={e => {
                        if (runLocked) return;
                        setReplayProvider?.(activeProviderTab);
                        setNewModel?.(e.target.value);
                        setModelOverrideEnabled?.(true);
                      }}
                      placeholder="e.g. gpt-4-0613"
                      className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-slate-100 font-mono outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                    />
                    {showCustomModelWarning && (
                      <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90 leading-relaxed">
                        For stable Release Gate results, prefer a pinned Anthropic model id ending
                        in{" "}
                        <span className="font-mono bg-black/20 px-1 py-0.5 rounded">YYYYMMDD</span>.
                        <span className="block mt-1 text-amber-400/80">
                          Custom/latest ids can change behavior over time.
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/5">
                    <span
                      className={clsx(
                        "text-xs font-medium",
                        modelOverrideEnabled ? "text-fuchsia-300" : "text-slate-500"
                      )}
                    >
                      {modelOverrideEnabled
                        ? "Model override is active for this run"
                        : "Currently using detected baseline model"}
                    </span>
                    {modelOverrideEnabled && (
                      <button
                        type="button"
                        disabled={runLocked}
                        onClick={() => {
                          if (runLocked) return;
                          setModelOverrideEnabled?.(false);
                          setNewModel?.(runDataModel || "");
                          setReplayProvider?.(runDataProvider);
                        }}
                        className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
                      >
                        Reset to detected
                      </button>
                    )}
                  </div>
                </div>

                {/* System Prompt */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm flex flex-col">
                  <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-3 block">
                    System Prompt
                  </div>
                  <textarea
                    value={requestSystemPrompt}
                    disabled={runLocked}
                    onChange={e => {
                      if (runLocked) return;
                      if (!setRequestBody || !applySystemPromptToBody) return;
                      setRequestBody(prev => applySystemPromptToBody(prev, e.target.value));
                    }}
                    placeholder="Override system prompt for the candidate run"
                    className="min-h-[140px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
                  />
                </div>

                {/* Sampling */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
                  <div className="mb-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
                      Sampling
                    </div>
                    <div className="text-sm text-slate-400">
                      Adjust candidate generation knobs without changing snapshot content.
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
                        value={
                          typeof requestBody.temperature === "number" ? requestBody.temperature : ""
                        }
                        onChange={e => updateRequestNumberField("temperature", e.target.value)}
                        disabled={runLocked}
                        className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
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
                        value={
                          typeof requestBody.max_tokens === "number" ? requestBody.max_tokens : ""
                        }
                        onChange={e => updateRequestNumberField("max_tokens", e.target.value)}
                        disabled={runLocked}
                        className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
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
                        disabled={runLocked}
                        className="w-full rounded-xl border border-white/10 bg-[#0a0c10] px-4 py-2.5 text-sm font-mono text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all"
                      />
                    </label>
                  </div>
                </div>

                {/* Config-only JSON */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm flex flex-col">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                          Config-only JSON
                        </div>
                        {isJsonModified && (
                          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-400 border border-amber-500/20">
                            Modified
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        Advanced request configuration. Excludes tools, prompt, and per-snapshot
                        content.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetJsonToBaseline}
                      disabled={runLocked || !isJsonModified || !baselinePayload}
                      className="shrink-0 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <RefreshCcw className="w-3.5 h-3.5" />
                      Reset to baseline
                    </button>
                  </div>
                  <textarea
                    value={candidateJsonValue}
                    disabled={runLocked}
                    onChange={e => setRequestJsonDraft?.(e.target.value)}
                    onBlur={() => handleRequestJsonBlur?.()}
                    spellCheck={false}
                    className="min-h-[300px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] p-5 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
                  />
                  {requestJsonError && (
                    <div className="mt-3 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      {requestJsonError}
                    </div>
                  )}
                </div>

                {/* Tools */}
                <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">
                        Tools
                      </div>
                      <div className="text-sm text-slate-400">
                        Edit tool definitions separately from the config JSON.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addTool}
                      disabled={runLocked}
                      className="shrink-0 flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-all"
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
                          <div
                            key={tool.id}
                            className="rounded-xl border border-white/10 bg-[#0a0c10] p-5"
                          >
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
                                disabled={runLocked}
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
                                  disabled={runLocked}
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
                                  onChange={e =>
                                    updateTool(tool.id, { description: e.target.value })
                                  }
                                  disabled={runLocked}
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
                                disabled={runLocked}
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
                </div>
              </section>
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
              >
                <X className="w-5 h-5" />
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
    </ClientPortal>
  );
}
