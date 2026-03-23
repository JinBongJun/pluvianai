"use client";

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import useSWR from "swr";
import {
  Plus,
  Trash2,
  X,
  RefreshCcw,
  SearchCode,
  Loader2,
  Upload,
  ChevronDown,
} from "lucide-react";

import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import { sanitizePayloadForPreview } from "./ReleaseGatePageContent";
import { ClientPortal } from "@/components/shared/ClientPortal";
import { ToolTimelinePanel } from "@/components/tool-timeline/ToolTimelinePanel";
import { liveViewAPI, type LiveViewToolTimelineRow } from "@/lib/api/live-view";
import { buildNodeRequestOverview } from "@/lib/requestOverview";

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

type ConfigModalTab = "core" | "parity" | "preview";

function CollapsiblePanel({
  title,
  subtitle,
  open,
  onToggle,
  children,
  className,
}: {
  title: string;
  subtitle: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden shadow-sm",
        className
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0c10]"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div>
        </div>
        <ChevronDown
          className={clsx("h-5 w-5 shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? <div className="border-t border-white/5 px-5 pb-5 pt-1">{children}</div> : null}
    </div>
  );
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
  const [configTab, setConfigTab] = useState<ConfigModalTab>("core");
  const [showExpandedCandidatePreview, setShowExpandedCandidatePreview] = useState(false);
  const [parityOpenTools, setParityOpenTools] = useState(false);
  const [parityOpenOverrides, setParityOpenOverrides] = useState(false);
  const [parityOpenContext, setParityOpenContext] = useState(false);
  const [parityOpenTimeline, setParityOpenTimeline] = useState(false);

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
  const requestBodyOverrides = (ctx?.requestBodyOverrides as Record<string, unknown> | undefined) ?? {};
  const requestBodyOverridesJson = (ctx?.requestBodyOverridesJson as string) ?? "{}";
  const bodyOverridesJsonDraft = (ctx?.bodyOverridesJsonDraft as string | null) ?? null;
  const setBodyOverridesJsonDraft = ctx?.setBodyOverridesJsonDraft as
    | ((value: string | null) => void)
    | undefined;
  const bodyOverridesJsonError = (ctx?.bodyOverridesJsonError as string) ?? "";
  const setBodyOverridesJsonError = ctx?.setBodyOverridesJsonError as ((s: string) => void) | undefined;
  const requestBodyOverridesBySnapshotId =
    (ctx?.requestBodyOverridesBySnapshotId as Record<string, Record<string, unknown>> | undefined) ??
    {};
  const bodyOverridesSnapshotDraftRaw =
    (ctx?.bodyOverridesSnapshotDraftRaw as Record<string, string> | undefined) ?? {};
  const setBodyOverridesSnapshotDraftRaw = ctx?.setBodyOverridesSnapshotDraftRaw as
    | React.Dispatch<React.SetStateAction<Record<string, string>>>
    | undefined;
  const bodyOverridesSnapshotJsonError =
    (ctx?.bodyOverridesSnapshotJsonError as Record<string, string> | undefined) ?? {};
  const setBodyOverridesSnapshotJsonError = ctx?.setBodyOverridesSnapshotJsonError as
    | React.Dispatch<React.SetStateAction<Record<string, string>>>
    | undefined;
  const handleBodyOverridesJsonBlur = ctx?.handleBodyOverridesJsonBlur as (() => void) | undefined;
  const handleBodyOverridesSnapshotBlur = ctx?.handleBodyOverridesSnapshotBlur as
    | ((sid: string) => void)
    | undefined;
  const applyLoadedGlobalBodyOverrides = ctx?.applyLoadedGlobalBodyOverrides as
    | ((obj: Record<string, unknown>) => void)
    | undefined;
  const applyLoadedSnapshotBodyOverrides = ctx?.applyLoadedSnapshotBodyOverrides as
    | ((sid: string, obj: Record<string, unknown>) => void)
    | undefined;
  const clearBodyOverrides = ctx?.clearBodyOverrides as (() => void) | undefined;
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
  const runDataPrompt = (ctx?.runDataPrompt as string) ?? "";
  const baselineSeedSnapshotForOverview =
    (ctx?.baselineSeedSnapshot as Record<string, unknown> | null) ?? null;
  const baselinePayload = (ctx?.baselinePayload as Record<string, unknown> | null) ?? null;
  const finalCandidateRequest = (ctx?.finalCandidateRequest as Record<string, unknown> | null) ?? null;
  const baselineConfigSummary = (ctx?.baselineConfigSummary as string) ?? "";
  const validateOverridePreview = (ctx?.validateOverridePreview as
    | Record<string, unknown>
    | null) ?? null;
  const selectedBaselineCount = Number(ctx?.selectedBaselineCount ?? 0);
  const selectedDataSummary =
    (ctx?.selectedDataSummary as string) ??
    "No baseline data yet. Select representative \"good\" snapshots from Live Logs or Saved Data.";
  const runLocked = Boolean(ctx?.isValidating) || Boolean(ctx?.activeJobId);
  const editsLocked = runLocked;
  const repeatRuns = Number(ctx?.repeatRuns ?? 0);

  const toolContextMode = (ctx?.toolContextMode as "recorded" | "inject") ?? "recorded";
  const setToolContextMode = ctx?.setToolContextMode as
    | ((v: "recorded" | "inject") => void)
    | undefined;
  const toolContextScope = (ctx?.toolContextScope as "global" | "per_snapshot") ?? "per_snapshot";
  const setToolContextScope = ctx?.setToolContextScope as
    | ((v: "global" | "per_snapshot") => void)
    | undefined;
  const toolContextGlobalText = (ctx?.toolContextGlobalText as string) ?? "";
  const setToolContextGlobalText = ctx?.setToolContextGlobalText as
    | ((v: string) => void)
    | undefined;
  const toolContextBySnapshotId =
    (ctx?.toolContextBySnapshotId as Record<string, string> | undefined) ?? {};
  const setToolContextBySnapshotId = ctx?.setToolContextBySnapshotId as
    | React.Dispatch<React.SetStateAction<Record<string, string>>>
    | undefined;
  const toolContextLoadBusy = Boolean(ctx?.toolContextLoadBusy);
  const handleLoadToolContextFromSnapshots = ctx?.handleLoadToolContextFromSnapshots as
    | (() => void | Promise<void>)
    | undefined;
  const selectedSnapshotIdsForRun = (ctx?.selectedSnapshotIdsForRun as string[] | undefined) ?? [];

  const bodyOverridesFileInputRef = useRef<HTMLInputElement>(null);
  const [bodyOverridesFileLoadTarget, setBodyOverridesFileLoadTarget] = useState<
    "global" | { sid: string } | null
  >(null);

  const hasAnyBodyOverridesContent = useMemo(() => {
    const hasGlobal =
      Object.keys(requestBodyOverrides).length > 0 ||
      Boolean(bodyOverridesJsonDraft?.trim()) ||
      Boolean(bodyOverridesJsonError);
    const hasPer = Object.values(requestBodyOverridesBySnapshotId).some(
      o => o && Object.keys(o).length > 0
    );
    const hasPerDraft = Object.values(bodyOverridesSnapshotDraftRaw).some(t => t.trim());
    return hasGlobal || hasPer || hasPerDraft;
  }, [
    requestBodyOverrides,
    bodyOverridesJsonDraft,
    bodyOverridesJsonError,
    requestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw,
  ]);

  const triggerBodyOverridesFilePick = (target: "global" | { sid: string }) => {
    if (editsLocked) return;
    setBodyOverridesFileLoadTarget(target);
    requestAnimationFrame(() => bodyOverridesFileInputRef.current?.click());
  };

  const onBodyOverridesFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = bodyOverridesFileLoadTarget;
    setBodyOverridesFileLoadTarget(null);
    if (!file || !target) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Must be a JSON object.");
      }
      const obj = parsed as Record<string, unknown>;
      if (target === "global") {
        applyLoadedGlobalBodyOverrides?.(obj);
      } else {
        applyLoadedSnapshotBodyOverrides?.(target.sid, obj);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load file.";
      if (target === "global") {
        setBodyOverridesJsonError?.(msg);
      } else {
        setBodyOverridesSnapshotJsonError?.(prev => ({ ...prev, [target.sid]: msg }));
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setActiveProviderTab(modelOverrideEnabled ? replayProvider : runDataProvider);
  }, [isOpen, modelOverrideEnabled, replayProvider, runDataProvider]);

  useEffect(() => {
    if (isOpen) setConfigTab("core");
  }, [isOpen]);

  const finalCandidateJson = useMemo(
    () => stringifyJson(validateOverridePreview ?? {}),
    [validateOverridePreview]
  );

  // "Final Override Payload"에 표시되는 값과 동일한 "실제로 적용될" 모델/제공자를 보여준다.
  // override가 꺼져있으면 감지값(runDataModel/runDataProvider)을 사용하고,
  // override가 켜져있으면 validateOverridePreview에 들어가는 new_model/replay_provider를 우선한다.
  const previewNewModel =
    typeof (validateOverridePreview as any)?.new_model === "string"
      ? String((validateOverridePreview as any)?.new_model)
      : "";
  const previewReplayProviderRaw = (validateOverridePreview as any)?.replay_provider;
  const usingModel = previewNewModel.trim().length ? previewNewModel.trim() : runDataModel;
  const usingProvider = toReplayProvider(previewReplayProviderRaw ?? runDataProvider);
  const candidateJsonValue = requestJsonDraft ?? requestBodyJson;
  const bodyOverridesJsonValue = bodyOverridesJsonDraft ?? requestBodyOverridesJson;
  const baselineRequestOverview = useMemo(
    () =>
      buildNodeRequestOverview({
        payload: baselinePayload,
        provider: baselineSeedSnapshotForOverview?.provider ?? runDataProvider,
        model: baselineSeedSnapshotForOverview?.model ?? runDataModel,
        requestContextMeta: (baselineSeedSnapshotForOverview?.request_context_meta as any) ?? null,
        serverRequestOverview: (baselineSeedSnapshotForOverview?.request_overview as any) ?? null,
      }),
    [baselinePayload, baselineSeedSnapshotForOverview, runDataProvider, runDataModel]
  );
  const candidateRequestOverview = useMemo(
    () =>
      buildNodeRequestOverview({
        payload: finalCandidateRequest,
        provider: usingProvider,
        model: usingModel,
      }),
    [finalCandidateRequest, usingProvider, usingModel]
  );
  const parityEnvironmentNotes = useMemo(() => {
    const notes: string[] = [];
    if (baselineRequestOverview.truncated) {
      notes.push(
        "Baseline request content was truncated before ingest. Replay may still differ from production."
      );
    } else if (baselineRequestOverview.omittedByPolicy) {
      notes.push(
        "Baseline request content was limited by SDK/privacy policy. Replay will only use the captured shape."
      );
    }

    const missingExtended = baselineRequestOverview.extendedContextKeys.filter(
      key => !candidateRequestOverview.extendedContextKeys.includes(key)
    );
    if (missingExtended.length > 0) {
      notes.push(
        `Baseline included extended context keys that are not present in the candidate replay payload: ${missingExtended.join(", ")}. Add them in Core (config JSON) or Environment parity (extra request fields) if needed.`
      );
    }

    const missingAdditional = baselineRequestOverview.additionalRequestKeys.filter(
      key => !candidateRequestOverview.additionalRequestKeys.includes(key)
    );
    if (missingAdditional.length > 0) {
      notes.push(
        `Baseline included additional request keys that are not present in the candidate replay payload: ${missingAdditional.join(", ")}. Restore with extra request fields (replay_overrides) when appropriate.`
      );
    }

    return notes;
  }, [baselineRequestOverview, candidateRequestOverview]);

  const parityCandidateShapeNotes = useMemo(() => {
    const notes: string[] = [];
    if (baselineRequestOverview.toolsCount > 0 && candidateRequestOverview.toolsCount === 0) {
      notes.push(
        "Baseline had tools in the request, but the candidate replay payload currently lists none. This may be an intentional model/tools experiment (Core setup) or an oversight—confirm before shipping."
      );
    }
    return notes;
  }, [baselineRequestOverview, candidateRequestOverview]);

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
    if (editsLocked || !setRequestBody) return;
    if (!baselinePayload) return;
    const sanitized = sanitizePayloadForPreview(baselinePayload);
    const clean = { ...sanitized };
    delete clean.tools;
    delete (clean as any).system_prompt;
    setRequestBody(clean);
    setRequestJsonDraft?.(null);
  };

  const systemPromptOverride = typeof requestBody.system_prompt === "string" ? requestBody.system_prompt : "";
  const isSystemPromptOverridden =
    systemPromptOverride.trim().length > 0 && systemPromptOverride.trim() !== runDataPrompt.trim();

  const handleResetSystemPrompt = () => {
    if (editsLocked || !setRequestBody) return;
    setRequestBody(prev => {
      const next = { ...prev };
      delete (next as any).system_prompt;
      return next;
    });
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
    if (editsLocked) return;
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
    if (editsLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => prev.map(tool => (tool.id === toolId ? { ...tool, ...patch } : tool)));
  };

  const addTool = () => {
    if (editsLocked) return;
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
    if (editsLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => prev.filter(tool => tool.id !== toolId));
  };

  const projectId = Number(ctx?.projectId ?? 0);
  const baselineSeedSnapshot = (ctx?.baselineSeedSnapshot as Record<string, unknown> | null) ?? null;
  const runSnapshotIds = (ctx?.runSnapshotIds as string[] | undefined) ?? [];

  const snapshotIdForBaselineTimeline = useMemo(() => {
    const seedId = baselineSeedSnapshot?.id;
    if (typeof seedId === "number" && Number.isFinite(seedId)) return seedId;
    if (runSnapshotIds.length > 0) {
      const n = Number(runSnapshotIds[0]);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }, [baselineSeedSnapshot, runSnapshotIds]);

  const { data: baselineSnapshotDetail, isLoading: baselineTimelineLoading } = useSWR(
    isOpen && projectId > 0 && snapshotIdForBaselineTimeline != null
      ? ["release-gate-config-baseline-timeline", projectId, snapshotIdForBaselineTimeline]
      : null,
    () => liveViewAPI.getSnapshot(projectId, snapshotIdForBaselineTimeline!)
  );

  const baselineToolTimelineRows: LiveViewToolTimelineRow[] = useMemo(() => {
    const raw = baselineSnapshotDetail as Record<string, unknown> | undefined;
    const tl = raw?.tool_timeline;
    return Array.isArray(tl) ? (tl as LiveViewToolTimelineRow[]) : [];
  }, [baselineSnapshotDetail]);

  const perLogOverridesCount = useMemo(() => {
    return Object.keys(requestBodyOverridesBySnapshotId).filter(
      sid => Object.keys(requestBodyOverridesBySnapshotId[sid] ?? {}).length > 0
    ).length;
  }, [requestBodyOverridesBySnapshotId]);

  const paritySummaryLines = useMemo(
    () => [
      {
        label: "Model",
        value: modelOverrideEnabled ? "Overridden vs baseline" : "Same as detected baseline",
      },
      {
        label: "System prompt",
        value: isSystemPromptOverridden ? "Overridden" : "Baseline / node default",
      },
      {
        label: "Config JSON",
        value: isJsonModified ? "Edited" : "Matches sanitized baseline",
      },
      {
        label: "Tools",
        value: toolsList.length > 0 ? `${toolsList.length} defined` : "None",
      },
      {
        label: "Extra request data",
        value: hasAnyBodyOverridesContent
          ? perLogOverridesCount > 0
            ? `Set (shared + ${perLogOverridesCount} log${perLogOverridesCount === 1 ? "" : "s"})`
            : "Set (shared)"
          : "None",
      },
      {
        label: "Extra system context",
        value: toolContextMode === "inject" ? "Appending on replay" : "Recorded only",
      },
      {
        label: "Baseline tool timeline",
        value: !snapshotIdForBaselineTimeline
          ? "No snapshot selected"
          : baselineTimelineLoading
            ? "Loading…"
            : baselineToolTimelineRows.length > 0
              ? `${baselineToolTimelineRows.length} events`
              : "None captured",
      },
    ],
    [
      modelOverrideEnabled,
      isSystemPromptOverridden,
      isJsonModified,
      toolsList.length,
      hasAnyBodyOverridesContent,
      perLogOverridesCount,
      toolContextMode,
      snapshotIdForBaselineTimeline,
      baselineTimelineLoading,
      baselineToolTimelineRows.length,
    ]
  );

  const toolsSummarySubtitle =
    toolsList.length === 0 ? "No tools configured" : `${toolsList.length} tool definition(s)`;
  const overridesSummarySubtitle = hasAnyBodyOverridesContent
    ? perLogOverridesCount > 0
      ? `Shared and/or per-log overrides (${perLogOverridesCount} log${perLogOverridesCount === 1 ? "" : "s"})`
      : "Shared overrides active"
    : "No extra request fields";
  const contextSummarySubtitle =
    toolContextMode === "inject"
      ? toolContextScope === "global"
        ? "Shared append to system prompt"
        : "Per-log append (with optional fallback)"
      : "Replay uses captured request data only";
  const timelineSummarySubtitle = !snapshotIdForBaselineTimeline
    ? "Select a baseline snapshot on the main screen"
    : baselineTimelineLoading
      ? "Loading…"
      : baselineToolTimelineRows.length > 0
        ? `${baselineToolTimelineRows.length} recorded events`
        : "No tool I/O captured for this snapshot";

  if (!isOpen || !ctx) return null;

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
          {/* Header */}
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
                Choose a baseline, tune the candidate on the tabs, then open Preview to verify the final
                request payload.
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

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto overscroll-y-contain p-8 custom-scrollbar">
            <div className="flex flex-col gap-6">
              {selectedBaselineCount === 0 && (
                <div className="w-full rounded-xl border border-amber-500/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-200/90 font-medium flex items-center gap-3">
                  <SearchCode className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>
                    No baseline data selected. First, send traffic to Live View, then choose baseline snapshots from Live Logs or Saved Data before running a Release Gate.
                  </span>
                </div>
              )}
              <div className="grid gap-8 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)] items-start">
              {/* Left Column: Baseline + parity summary */}
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
                      <div className="text-sm text-slate-300 font-medium">
                        {selectedBaselineCount} selected
                      </div>
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
                      <div className="text-sm text-slate-200">
                        {formatProviderLabel(runDataProvider)}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 flex flex-col">
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
                              baselineRequestOverview.topP != null
                                ? `top_p ${baselineRequestOverview.topP}`
                                : null,
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

                    {runDataPrompt ? (
                      <pre className="min-h-[120px] max-h-[220px] rounded-xl border border-white/5 bg-[#0a0c10] p-4 text-[12px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all overflow-auto custom-scrollbar shadow-inner">
                        {runDataPrompt}
                      </pre>
                    ) : (
                      <div className="min-h-[140px] rounded-xl border border-dashed border-white/10 bg-white/[0.01] flex flex-col items-center justify-center gap-3 text-center p-6">
                        <SearchCode className="w-8 h-8 text-slate-600" />
                        <div>
                          <div className="text-sm font-semibold text-slate-300 mb-1">
                            No system prompt available
                          </div>
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
                    Candidate vs baseline (quick read)
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

              {/* Right Column: tabs */}
              <section className="min-w-0 space-y-4 pb-8">
                {!runLocked && selectedBaselineCount === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-400">
                    You can tune candidate settings now, but Release Gate needs at least one baseline
                    snapshot on the main screen before you can run a real validation.
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
                {configTab === "preview" ? (
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
                      <div className="text-sm text-slate-200">
                        {formatProviderLabel(usingProvider)}
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="mb-4 rounded-xl border border-white/5 bg-black/20 p-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                        Candidate request summary
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <div className="text-xs text-slate-400">
                          Messages preserved
                          <div className="mt-1 text-sm font-semibold text-slate-200">
                            {candidateRequestOverview.messageCount}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          Tools
                          <div className="mt-1 text-sm font-semibold text-slate-200">
                            {candidateRequestOverview.toolsCount}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          Extended context keys
                          <div className="mt-1 text-sm font-semibold text-slate-200">
                            {candidateRequestOverview.extendedContextKeys.length || "0"}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          Additional request keys
                          <div className="mt-1 text-sm font-semibold text-slate-200">
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
                          Candidate replay still includes the key request shape detected on the baseline node call.
                        </div>
                      ) : null}
                    </div>
                    <pre className="min-h-[160px] max-h-[min(360px,45vh)] rounded-xl border border-white/5 bg-[#0a0c10] p-4 text-[12px] leading-relaxed text-slate-300 font-mono whitespace-pre-wrap break-all overflow-auto custom-scrollbar shadow-inner">
                      {validateOverridePreview
                        ? finalCandidateJson
                        : selectedBaselineCount === 0
                          ? "Select a baseline on the main screen to build a preview payload."
                          : "No override payload available yet. Adjust Core setup, then check again."}
                    </pre>
                  </div>
                </div>
                ) : null}

                {configTab === "core" ? (
                <>
                {modelOverrideEnabled && (
                  <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-5 py-4 text-sm text-fuchsia-200 font-medium">
                    Platform-provided model mode is active. Personal provider key is not required
                    for this run.
                  </div>
                )}

                <div className="rounded-2xl border border-fuchsia-500/25 bg-gradient-to-br from-fuchsia-500/[0.08] to-transparent p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-fuchsia-300/90 mb-2">
                    Candidate run (all selected logs)
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    One candidate per run: the same model, system prompt, sampling, thresholds, and
                    config JSON apply to every selected log. Use Environment parity when specific logs need
                    different attachments, metadata, or injected context.
                  </p>
                  {repeatRuns > 0 ? (
                    <p className="mt-2 text-[11px] text-slate-500">
                      Repeat runs:{" "}
                      <span className="font-mono text-slate-300">{repeatRuns}×</span> (from the run
                      controls on the main screen)
                    </p>
                  ) : null}
                </div>

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
                          disabled={editsLocked}
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
                            "rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] transition-all disabled:cursor-not-allowed disabled:opacity-40",
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
                          disabled={editsLocked}
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
                          disabled={editsLocked}
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
                        disabled={editsLocked}
                        onClick={() => {
                          if (editsLocked) return;
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
                      disabled={editsLocked}
                      onChange={e => {
                        if (editsLocked) return;
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
                        disabled={editsLocked}
                        onClick={() => {
                          if (editsLocked) return;
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
                    disabled={editsLocked}
                    onChange={e => {
                      if (editsLocked) return;
                      if (!setRequestBody || !applySystemPromptToBody) return;
                      setRequestBody(prev => applySystemPromptToBody(prev, e.target.value));
                    }}
                    placeholder="Override system prompt for the candidate run"
                    className="min-h-[140px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] p-4 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={editsLocked || !isSystemPromptOverridden}
                      onClick={handleResetSystemPrompt}
                      className="shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Reset to node default
                    </button>
                    <div className="text-xs text-slate-500">
                      {isSystemPromptOverridden ? "Override active" : "Using node default"}
                    </div>
                  </div>
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
                        disabled={editsLocked}
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
                        disabled={editsLocked}
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
                        disabled={editsLocked}
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
                        Run-wide JSON merged for every log. Excludes tools (Environment parity tab), system
                        prompt (field above), and per-snapshot restoration fields. Prefer{" "}
                        <span className="font-mono text-slate-500">replay_overrides</span> in Environment
                        parity for attachments and other non-message fields that vary by snapshot.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetJsonToBaseline}
                      disabled={editsLocked || !isJsonModified || !baselinePayload}
                      className="shrink-0 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
                    className="min-h-[300px] w-full flex-1 rounded-xl border border-white/10 bg-[#0a0c10] p-5 text-[13px] font-mono leading-relaxed text-slate-200 outline-none focus:border-fuchsia-500/50 focus:ring-1 focus:ring-fuchsia-500/50 transition-all custom-scrollbar resize-y"
                  />
                  {requestJsonError && (
                    <div className="mt-3 text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      {requestJsonError}
                    </div>
                  )}
                </div>
                </>
                ) : null}

                {configTab === "parity" ? (
                <>
                <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-xs leading-relaxed text-slate-500">
                  Align replays with captured production traffic: tool schemas, optional extra request fields
                  sent as <span className="font-mono text-slate-500">replay_overrides</span>, per-log
                  overrides, optional injected system context, and read-only baseline tool activity for
                  inspection.
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
                                  onChange={e =>
                                    updateTool(tool.id, { description: e.target.value })
                                  }
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
                {/* Additional request body fields (API: replay_overrides) */}
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
                        Optional non-message fields merged into the replay request body after the
                        configuration JSON. Sent as{" "}
                        <span className="font-mono text-slate-300">replay_overrides</span> (e.g.{" "}
                        <span className="font-mono text-slate-500">attachments</span>,{" "}
                        <span className="font-mono text-slate-500">documents</span>, retrieval keys). Does
                        not replace <span className="font-mono text-slate-500">messages</span> or user text
                        from snapshots. Shared fields win over the same key from config JSON; per-log fields
                        win over shared fields for that log only.
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
                  <div className="text-[10px] text-slate-500 mb-2">
                    Shared (all selected logs unless overridden below)
                  </div>
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
                      <span className="font-mono text-slate-500">replay_overrides_by_snapshot_id</span>).
                      Same rules and disallowed keys apply.
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
                {/* tool_context — optional text appended on replay */}
                <div className="pt-2">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm text-slate-400">
                        Optional text appended to the system prompt on replay when ingest omitted tool
                        results or customer content. Use recorded logs when available, or paste your own
                        material for controlled experiments.
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
                {/* Read-only — execution still comes from captured snapshots */}
                <div className="pt-2">
                  <div className="mb-4">
                    <div className="text-sm text-slate-400">
                      Read-only tool I/O for the representative baseline snapshot (first selected).
                      Matches Live View snapshot detail and Release Gate evidence.
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
                      No tool I/O captured for this snapshot. Instrument your app or upgrade the SDK
                      to send <span className="font-mono text-slate-300">tool_events</span> on ingest.
                    </div>
                  ) : (
                    <ToolTimelinePanel
                      variant="compact"
                      title="Tool timeline"
                      subtitle={
                        snapshotIdForBaselineTimeline != null
                          ? `Snapshot #${snapshotIdForBaselineTimeline}`
                          : undefined
                      }
                      rows={baselineToolTimelineRows}
                    />
                  )}
                </div>
                </CollapsiblePanel>

                </>
                ) : null}
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
