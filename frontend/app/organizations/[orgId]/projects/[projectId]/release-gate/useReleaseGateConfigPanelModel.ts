"use client";

import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { ReleaseGatePageContext } from "./ReleaseGatePageContext";
import type { ReplayProvider } from "./releaseGatePageContent.lib";
import { isPinnedAnthropicModelId, stringifyJson, toReplayProvider } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateEditableTool } from "./releaseGatePageContext.types";
import { sanitizePayloadForPreview } from "./ReleaseGatePageContent";
import { liveViewAPI, type LiveViewToolTimelineRow } from "@/lib/api/live-view";
import { buildNodeRequestOverview } from "@/lib/requestOverview";

export type ReleaseGateConfigModalTab = "core" | "parity" | "preview";

export type ReleaseGateConfigThresholdPreset = "strict" | "default" | "lenient" | "custom";

type EditableTool = ReleaseGateEditableTool;

export function useReleaseGateConfigPanelModel(isOpen: boolean) {
  const ctx = useContext(ReleaseGatePageContext)!;

  const [activeProviderTab, setActiveProviderTab] = useState<ReplayProvider>("openai");
  const [showRawBaseline, setShowRawBaseline] = useState(false);
  const [configTab, setConfigTab] = useState<ReleaseGateConfigModalTab>("core");
  const [showExpandedCandidatePreview, setShowExpandedCandidatePreview] = useState(false);
  const [parityOpenTools, setParityOpenTools] = useState(false);
  const [parityOpenOverrides, setParityOpenOverrides] = useState(false);
  const [parityOpenContext, setParityOpenContext] = useState(false);
  const [parityOpenTimeline, setParityOpenTimeline] = useState(false);

  const REPLAY_PROVIDER_MODEL_LIBRARY = ctx.REPLAY_PROVIDER_MODEL_LIBRARY as Record<
    ReplayProvider,
    string[]
  >;
  const REPLAY_THRESHOLD_PRESETS = ctx.REPLAY_THRESHOLD_PRESETS as Record<
    string,
    { label: string; failRateMax: number; flakyRateMax: number }
  >;
  const thresholdPreset = (ctx.thresholdPreset as ReleaseGateConfigThresholdPreset) ?? "default";
  const setThresholdPreset = ctx.setThresholdPreset as
    | ((value: ReleaseGateConfigThresholdPreset) => void)
    | undefined;
  const normalizeGateThresholds = ctx.normalizeGateThresholds as
    | ((
        failRateMax: unknown,
        flakyRateMax: unknown
      ) => { failRateMax: number; flakyRateMax: number })
    | undefined;
  const failRateMax = Number(ctx.failRateMax ?? 0);
  const setFailRateMax = ctx.setFailRateMax as ((value: number) => void) | undefined;
  const flakyRateMax = Number(ctx.flakyRateMax ?? 0);
  const setFlakyRateMax = ctx.setFlakyRateMax as ((value: number) => void) | undefined;
  const newModel = (ctx.newModel as string) ?? "";
  const setNewModel = ctx.setNewModel as ((value: string) => void) | undefined;
  const modelOverrideEnabled = Boolean(ctx.modelOverrideEnabled);
  const setModelOverrideEnabled = ctx.setModelOverrideEnabled as
    | ((value: boolean) => void)
    | undefined;
  const replayProvider = toReplayProvider(ctx.replayProvider);
  const setReplayProvider = ctx.setReplayProvider as ((value: ReplayProvider) => void) | undefined;
  const requestBody = (ctx.requestBody as Record<string, unknown>) ?? {};
  const setRequestBody = ctx.setRequestBody as
    | React.Dispatch<React.SetStateAction<Record<string, unknown>>>
    | undefined;
  const requestBodyJson = (ctx.requestBodyJson as string) ?? "{}";
  const requestJsonDraft = (ctx.requestJsonDraft as string | null) ?? null;
  const setRequestJsonDraft = ctx.setRequestJsonDraft as
    | ((value: string | null) => void)
    | undefined;
  const requestJsonError = (ctx.requestJsonError as string) ?? "";
  const requestBodyOverrides = (ctx.requestBodyOverrides as Record<string, unknown> | undefined) ?? {};
  const requestBodyOverridesJson = (ctx.requestBodyOverridesJson as string) ?? "{}";
  const bodyOverridesJsonDraft = (ctx.bodyOverridesJsonDraft as string | null) ?? null;
  const setBodyOverridesJsonDraft = ctx.setBodyOverridesJsonDraft as
    | ((value: string | null) => void)
    | undefined;
  const bodyOverridesJsonError = (ctx.bodyOverridesJsonError as string) ?? "";
  const setBodyOverridesJsonError = ctx.setBodyOverridesJsonError as ((s: string) => void) | undefined;
  const requestBodyOverridesBySnapshotId =
    (ctx.requestBodyOverridesBySnapshotId as Record<string, Record<string, unknown>> | undefined) ??
    {};
  const bodyOverridesSnapshotDraftRaw =
    (ctx.bodyOverridesSnapshotDraftRaw as Record<string, string> | undefined) ?? {};
  const setBodyOverridesSnapshotDraftRaw = ctx.setBodyOverridesSnapshotDraftRaw as
    | React.Dispatch<React.SetStateAction<Record<string, string>>>
    | undefined;
  const bodyOverridesSnapshotJsonError =
    (ctx.bodyOverridesSnapshotJsonError as Record<string, string> | undefined) ?? {};
  const setBodyOverridesSnapshotJsonError = ctx.setBodyOverridesSnapshotJsonError as
    | React.Dispatch<React.SetStateAction<Record<string, string>>>
    | undefined;
  const handleBodyOverridesJsonBlur = ctx.handleBodyOverridesJsonBlur as (() => void) | undefined;
  const handleBodyOverridesSnapshotBlur = ctx.handleBodyOverridesSnapshotBlur as
    | ((sid: string) => void)
    | undefined;
  const applyLoadedGlobalBodyOverrides = ctx.applyLoadedGlobalBodyOverrides as
    | ((obj: Record<string, unknown>) => void)
    | undefined;
  const applyLoadedSnapshotBodyOverrides = ctx.applyLoadedSnapshotBodyOverrides as
    | ((sid: string, obj: Record<string, unknown>) => void)
    | undefined;
  const clearBodyOverrides = ctx.clearBodyOverrides as (() => void) | undefined;
  const handleRequestJsonBlur = ctx.handleRequestJsonBlur as (() => void) | undefined;
  const applySystemPromptToBody = ctx.applySystemPromptToBody as
    | ((body: Record<string, unknown>, systemPrompt: string) => Record<string, unknown>)
    | undefined;
  const requestSystemPrompt = (ctx.requestSystemPrompt as string) ?? "";
  const toolsList = ((ctx.toolsList as EditableTool[] | undefined) ?? []) as EditableTool[];
  const setToolsList = ctx.setToolsList as
    | React.Dispatch<React.SetStateAction<EditableTool[]>>
    | undefined;
  const runDataProvider = toReplayProvider(ctx.runDataProvider);
  const runDataModel = (ctx.runDataModel as string) ?? "";
  const runDataPrompt = (ctx.runDataPrompt as string) ?? "";
  const baselineSeedSnapshotForOverview =
    (ctx.baselineSeedSnapshot as Record<string, unknown> | null) ?? null;
  const representativeBaselineId =
    baselineSeedSnapshotForOverview?.id != null
      ? String(baselineSeedSnapshotForOverview.id)
      : null;
  const baselinePayload = (ctx.baselinePayload as Record<string, unknown> | null) ?? null;
  const finalCandidateRequest = (ctx.finalCandidateRequest as Record<string, unknown> | null) ?? null;
  const baselineConfigSummary = (ctx.baselineConfigSummary as string) ?? "";
  const validateOverridePreview = (ctx.validateOverridePreview as
    | Record<string, unknown>
    | null) ?? null;
  const selectedBaselineCount = Number(ctx.selectedBaselineCount ?? 0);
  const selectedDataSummary =
    (ctx.selectedDataSummary as string) ??
    'No baseline data yet. Select representative "good" snapshots from Live Logs or Saved Data.';
  const runLocked = Boolean(ctx.isValidating) || Boolean(ctx.activeJobId);
  const editsLocked = runLocked;
  const repeatRuns = Number(ctx.repeatRuns ?? 0);

  const toolContextMode = (ctx.toolContextMode as "recorded" | "inject") ?? "recorded";
  const setToolContextMode = ctx.setToolContextMode as
    | ((v: "recorded" | "inject") => void)
    | undefined;
  const toolContextScope = (ctx.toolContextScope as "global" | "per_snapshot") ?? "per_snapshot";
  const setToolContextScope = ctx.setToolContextScope as
    | ((v: "global" | "per_snapshot") => void)
    | undefined;
  const toolContextGlobalText = (ctx.toolContextGlobalText as string) ?? "";
  const setToolContextGlobalText = ctx.setToolContextGlobalText as
    | ((v: string) => void)
    | undefined;
  const toolContextBySnapshotId =
    (ctx.toolContextBySnapshotId as Record<string, string> | undefined) ?? {};
  const setToolContextBySnapshotId = ctx.setToolContextBySnapshotId as
    | React.Dispatch<React.SetStateAction<Record<string, string>>>
    | undefined;
  const toolContextLoadBusy = Boolean(ctx.toolContextLoadBusy);
  const handleLoadToolContextFromSnapshots = ctx.handleLoadToolContextFromSnapshots as
    | (() => void | Promise<void>)
    | undefined;
  const selectedSnapshotIdsForRun = (ctx.selectedSnapshotIdsForRun as string[] | undefined) ?? [];
  const representativeBaselineUserSnapshotId =
    (ctx.representativeBaselineUserSnapshotId as string | null | undefined) ?? null;
  const setRepresentativeBaselineUserSnapshotId = ctx.setRepresentativeBaselineUserSnapshotId as
    | ((id: string | null) => void)
    | undefined;
  const autoRepresentativeBaselineSnapshotId =
    (ctx.autoRepresentativeBaselineSnapshotId as string | null | undefined) ?? null;
  const representativeBaselinePickerOptions =
    (ctx.representativeBaselinePickerOptions as { id: string; createdAt: string }[]) ?? [];

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

  const previewNewModel =
    typeof (validateOverridePreview as Record<string, unknown> | null)?.new_model === "string"
      ? String((validateOverridePreview as Record<string, unknown>).new_model)
      : "";
  const previewReplayProviderRaw = (validateOverridePreview as Record<string, unknown> | null)
    ?.replay_provider;
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
    delete (clean as Record<string, unknown> & { system_prompt?: unknown }).system_prompt;
    return stringifyJson(clean);
  }, [baselinePayload]);

  const isJsonModified = candidateJsonValue !== cleanBaselineForComparison;

  const handleResetJsonToBaseline = () => {
    if (editsLocked || !setRequestBody) return;
    if (!baselinePayload) return;
    const sanitized = sanitizePayloadForPreview(baselinePayload);
    const clean = { ...sanitized };
    delete clean.tools;
    delete (clean as Record<string, unknown> & { system_prompt?: unknown }).system_prompt;
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
      delete (next as Record<string, unknown> & { system_prompt?: unknown }).system_prompt;
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

  const projectId = Number(ctx.projectId ?? 0);
  const baselineSeedSnapshot = (ctx.baselineSeedSnapshot as Record<string, unknown> | null) ?? null;
  const runSnapshotIds = (ctx.runSnapshotIds as string[] | undefined) ?? [];

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

  return {
    activeProviderTab,
    setActiveProviderTab,
    showRawBaseline,
    setShowRawBaseline,
    configTab,
    setConfigTab,
    showExpandedCandidatePreview,
    setShowExpandedCandidatePreview,
    parityOpenTools,
    setParityOpenTools,
    parityOpenOverrides,
    setParityOpenOverrides,
    parityOpenContext,
    setParityOpenContext,
    parityOpenTimeline,
    setParityOpenTimeline,
    REPLAY_PROVIDER_MODEL_LIBRARY,
    REPLAY_THRESHOLD_PRESETS,
    thresholdPreset,
    setThresholdPreset,
    normalizeGateThresholds,
    failRateMax,
    setFailRateMax,
    flakyRateMax,
    setFlakyRateMax,
    newModel,
    setNewModel,
    modelOverrideEnabled,
    setModelOverrideEnabled,
    replayProvider,
    setReplayProvider,
    requestBody,
    setRequestBody,
    requestJsonDraft,
    setRequestJsonDraft,
    requestJsonError,
    bodyOverridesJsonDraft,
    setBodyOverridesJsonDraft,
    bodyOverridesJsonError,
    setBodyOverridesJsonError,
    requestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotDraftRaw,
    bodyOverridesSnapshotJsonError,
    setBodyOverridesSnapshotJsonError,
    handleBodyOverridesJsonBlur,
    handleBodyOverridesSnapshotBlur,
    clearBodyOverrides,
    handleRequestJsonBlur,
    applySystemPromptToBody,
    requestSystemPrompt,
    toolsList,
    setToolsList,
    runDataProvider,
    runDataModel,
    runDataPrompt,
    representativeBaselineId,
    baselinePayload,
    baselineConfigSummary,
    validateOverridePreview,
    selectedBaselineCount,
    selectedDataSummary,
    runLocked,
    editsLocked,
    repeatRuns,
    toolContextMode,
    setToolContextMode,
    toolContextScope,
    setToolContextScope,
    toolContextGlobalText,
    setToolContextGlobalText,
    toolContextBySnapshotId,
    setToolContextBySnapshotId,
    toolContextLoadBusy,
    handleLoadToolContextFromSnapshots,
    selectedSnapshotIdsForRun,
    representativeBaselineUserSnapshotId,
    setRepresentativeBaselineUserSnapshotId,
    autoRepresentativeBaselineSnapshotId,
    representativeBaselinePickerOptions,
    bodyOverridesFileInputRef,
    onBodyOverridesFileChange,
    hasAnyBodyOverridesContent,
    triggerBodyOverridesFilePick,
    finalCandidateJson,
    usingModel,
    usingProvider,
    candidateJsonValue,
    bodyOverridesJsonValue,
    baselineRequestOverview,
    candidateRequestOverview,
    parityEnvironmentNotes,
    parityCandidateShapeNotes,
    isJsonModified,
    handleResetJsonToBaseline,
    isSystemPromptOverridden,
    handleResetSystemPrompt,
    pinnedBadge,
    showCustomModelWarning,
    updateRequestNumberField,
    updateTool,
    addTool,
    removeTool,
    snapshotIdForBaselineTimeline,
    baselineTimelineLoading,
    baselineToolTimelineRows,
    paritySummaryLines,
    toolsSummarySubtitle,
    overridesSummarySubtitle,
    contextSummarySubtitle,
    timelineSummarySubtitle,
  };
}

export type ReleaseGateConfigPanelModel = ReturnType<typeof useReleaseGateConfigPanelModel>;
