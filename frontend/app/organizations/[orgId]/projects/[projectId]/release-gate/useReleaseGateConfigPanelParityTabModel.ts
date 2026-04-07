"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";

import type { ReleaseGateConfigPanelContextSlice } from "./releaseGateConfigPanelContextPick";
import { formatSnapshotShortLabel } from "./releaseGatePageContent.lib";
import type { LiveViewToolTimelineRow } from "@/lib/api/live-view";
import type { ReleaseGateEditableTool } from "./releaseGatePageContext.types";

type EditableTool = ReleaseGateEditableTool;

function summarizeBaselineToolResult(row: LiveViewToolTimelineRow): string {
  const result = row.tool_result;
  const stringify = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    try {
      return JSON.stringify(value, null, 2).trim();
    } catch {
      return String(value).trim();
    }
  };

  const resultObj = result && typeof result === "object" ? (result as Record<string, unknown>) : null;
  const outputObj =
    resultObj?.output && typeof resultObj.output === "object"
      ? (resultObj.output as Record<string, unknown>)
      : null;

  const candidate =
    (typeof outputObj?.preview === "string" && outputObj.preview.trim()) ||
    (typeof resultObj?.preview === "string" && resultObj.preview.trim()) ||
    stringify(resultObj?.output) ||
    stringify(result);

  if (!candidate) return "";
  return candidate.length > 320 ? `${candidate.slice(0, 320)}...` : candidate;
}

export function useReleaseGateConfigPanelParityTabModel(
  c: ReleaseGateConfigPanelContextSlice,
  editsLocked: boolean,
  isJsonModified: boolean,
  isSystemPromptOverridden: boolean,
  timeline: {
    snapshotIdForBaselineTimeline: number | null;
    baselineTimelineLoading: boolean;
    baselineToolTimelineRows: LiveViewToolTimelineRow[];
  }
) {
  const {
    modelSource,
    toolsList,
    setToolsList,
    requestBodyOverrides,
    bodyOverridesJsonDraft,
    bodyOverridesJsonError,
    requestBodyOverridesBySnapshotId,
    bodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setBodyOverridesJsonError,
    applyLoadedGlobalBodyOverrides,
    applyLoadedSnapshotBodyOverrides,
    baselineSnapshotsById,
    toolContextMode,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
  } = c;

  const { snapshotIdForBaselineTimeline, baselineTimelineLoading, baselineToolTimelineRows } =
    timeline;

  const [parityOpenTools, setParityOpenTools] = useState(true);
  const [parityOpenOverrides, setParityOpenOverrides] = useState(false);
  const [parityOpenContext, setParityOpenContext] = useState(false);
  const [parityOpenRecordedToolCalls, setParityOpenRecordedToolCalls] = useState(false);
  const [parityOpenRawJson, setParityOpenRawJson] = useState(false);

  const bodyOverridesFileInputRef = useRef<HTMLInputElement>(null);
  const [bodyOverridesFileLoadTarget, setBodyOverridesFileLoadTarget] = useState<
    "global" | { sid: string } | null
  >(null);
  const toolContextFileInputRef = useRef<HTMLInputElement>(null);
  const [toolContextFileLoadTarget, setToolContextFileLoadTarget] = useState<
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

  const triggerToolContextFilePick = (target: "global" | { sid: string }) => {
    if (editsLocked) return;
    setToolContextFileLoadTarget(target);
    requestAnimationFrame(() => toolContextFileInputRef.current?.click());
  };

  const onToolContextFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const target = toolContextFileLoadTarget;
    setToolContextFileLoadTarget(null);
    if (!file || !target) return;
    try {
      const text = (await file.text()).trim();
      if (!text) return;
      if (target === "global") {
        setToolContextGlobalText?.(text);
      } else {
        setToolContextBySnapshotId?.(prev => ({ ...prev, [target.sid]: text }));
      }
    } catch {
      // ignore invalid reads
    }
  };

  const getSnapshotParityLabel = useCallback(
    (sid: string) => formatSnapshotShortLabel(sid, baselineSnapshotsById.get(String(sid))),
    [baselineSnapshotsById]
  );

  const perLogOverridesCount = useMemo(() => {
    return Object.keys(requestBodyOverridesBySnapshotId).filter(
      sid => Object.keys(requestBodyOverridesBySnapshotId[sid] ?? {}).length > 0
    ).length;
  }, [requestBodyOverridesBySnapshotId]);

  const paritySummaryLines = useMemo(
    () => [
      {
        label: "Model",
        value:
          modelSource === "detected"
            ? "Same as detected baseline"
            : modelSource === "hosted"
              ? "Hosted model selected"
              : "Custom BYOK model selected",
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
        value:
          toolsList.length > 0 && baselineToolTimelineRows.length > 0
            ? `${toolsList.length} defined, ${baselineToolTimelineRows.length} recorded event${baselineToolTimelineRows.length === 1 ? "" : "s"}`
            : toolsList.length > 0
              ? `${toolsList.length} defined`
              : baselineToolTimelineRows.length > 0
                ? `${baselineToolTimelineRows.length} recorded I/O (add definitions to replay)`
                : "None",
      },
      {
        label: "Extra request fields",
        value: hasAnyBodyOverridesContent
          ? perLogOverridesCount > 0
            ? `Set (shared + ${perLogOverridesCount} log${perLogOverridesCount === 1 ? "" : "s"})`
            : "Set (shared)"
          : "None",
      },
      {
        label: "Extra system text",
        value:
          toolContextMode === "inject" ? "Adding extra system text" : "Using recorded request only",
      },
    ],
    [
      modelSource,
      isSystemPromptOverridden,
      isJsonModified,
      toolsList.length,
      hasAnyBodyOverridesContent,
      perLogOverridesCount,
      toolContextMode,
      baselineToolTimelineRows.length,
    ]
  );

  const toolsSummarySubtitle =
    toolsList.length === 0
      ? "No tools configured"
      : `${toolsList.length} tool${toolsList.length === 1 ? "" : "s"} configured`;
  const overridesSummarySubtitle = hasAnyBodyOverridesContent
    ? perLogOverridesCount > 0
      ? `Shared and per-log fields (${perLogOverridesCount} log${perLogOverridesCount === 1 ? "" : "s"})`
      : "Shared fields active"
    : "No request context fields";
  const contextSummarySubtitle =
    toolContextMode === "inject"
      ? c.toolContextScope === "global"
        ? "Shared missing context"
        : "Per-log missing context"
      : "Use baseline only";
  const timelineSummarySubtitle = !snapshotIdForBaselineTimeline
    ? "Select a baseline snapshot on the main screen"
    : baselineTimelineLoading
      ? "Loading recorded tool history"
      : baselineToolTimelineRows.length > 0
        ? `${baselineToolTimelineRows.length} recorded events`
        : "No tool I/O captured for this snapshot";

  const bodyOverridesJsonValue = bodyOverridesJsonDraft ?? c.requestBodyOverridesJson;

  const updateTool = (toolId: string, patch: Partial<EditableTool>) => {
    if (editsLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => prev.map(tool => (tool.id === toolId ? { ...tool, ...patch } : tool)));
  };

  const addTool = (toolType: "retrieval" | "action" = "retrieval") => {
    if (editsLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        description: "",
        toolType,
        parameters: '{\n  "type": "object",\n  "properties": {}\n}',
        expectedResultFields:
          toolType === "retrieval" ? [{ id: crypto.randomUUID(), name: "", description: "" }] : [],
        expectedActionFields:
          toolType === "action" ? [{ id: crypto.randomUUID(), name: "", description: "" }] : [],
        resultGuide: "",
        baselineSampleSummary: "",
      },
    ]);
  };

  const removeTool = (toolId: string) => {
    if (editsLocked) return;
    if (!setToolsList) return;
    setToolsList(prev => prev.filter(tool => tool.id !== toolId));
  };

  const importBaselineToolSamples = () => {
    if (editsLocked) return;
    if (!setToolsList) return;
    if (!baselineToolTimelineRows.length) return;

    const latestResultByTool = new Map<string, string>();
    for (const row of baselineToolTimelineRows) {
      const stepType = String(row.step_type || "").trim().toLowerCase();
      const toolName = String(row.tool_name || "").trim();
      if (stepType !== "tool_result" || !toolName) continue;
      const summary = summarizeBaselineToolResult(row);
      if (!summary) continue;
      latestResultByTool.set(toolName, summary);
    }

    if (latestResultByTool.size === 0) return;

    setToolsList(prev =>
      prev.map(tool => {
        const toolName = String(tool.name || "").trim();
        if (!toolName) return tool;
        const baselineSampleSummary = latestResultByTool.get(toolName);
        return baselineSampleSummary ? { ...tool, baselineSampleSummary } : tool;
      })
    );
  };

  return {
    parityOpenTools,
    setParityOpenTools,
    parityOpenOverrides,
    setParityOpenOverrides,
    parityOpenContext,
    setParityOpenContext,
    parityOpenRecordedToolCalls,
    setParityOpenRecordedToolCalls,
    parityOpenRawJson,
    setParityOpenRawJson,
    bodyOverridesFileInputRef,
    onBodyOverridesFileChange,
    triggerBodyOverridesFilePick,
    toolContextFileInputRef,
    onToolContextFileChange,
    triggerToolContextFilePick,
    hasAnyBodyOverridesContent,
    getSnapshotParityLabel,
    snapshotIdForBaselineTimeline,
    baselineTimelineLoading,
    baselineToolTimelineRows,
    paritySummaryLines,
    toolsSummarySubtitle,
    overridesSummarySubtitle,
    contextSummarySubtitle,
    recordedCallsSummarySubtitle: timelineSummarySubtitle,
    bodyOverridesJsonValue,
    updateTool,
    addTool,
    removeTool,
    importBaselineToolSamples,
  };
}

export type ReleaseGateConfigPanelParityTabModel = ReturnType<
  typeof useReleaseGateConfigPanelParityTabModel
>;

