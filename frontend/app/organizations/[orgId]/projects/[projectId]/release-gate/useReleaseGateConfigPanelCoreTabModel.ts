"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { isPinnedAnthropicModelId, stringifyJson } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateConfigPanelContextSlice } from "./releaseGateConfigPanelContextPick";
import type { ReplayProvider } from "./releaseGatePageContent.lib";
import {
  editableRequestBodyWithoutTools,
  releaseGateCoreRequestBodyFromBaseline,
} from "./releaseGatePageContent.lib";

export function useReleaseGateConfigPanelCoreTabModel(
  isOpen: boolean,
  c: ReleaseGateConfigPanelContextSlice,
  editsLocked: boolean
) {
  const {
    modelSource,
    replayProvider,
    runDataProvider,
    newModel,
    requestBody,
    setRequestBody,
    requestBodyJson,
    requestJsonDraft,
    setRequestJsonDraft,
    baselinePayload,
    runDataPrompt,
  } = c;

  const [activeProviderTab, setActiveProviderTab] = useState<ReplayProvider>("openai");
  const usingDetectedModel = modelSource === "detected";
  const usingCustomModel = modelSource === "custom";

  useEffect(() => {
    if (!isOpen) return;
    setActiveProviderTab(usingDetectedModel ? runDataProvider : replayProvider);
  }, [isOpen, usingDetectedModel, replayProvider, runDataProvider]);

  const candidateJsonValue = requestJsonDraft ?? requestBodyJson;

  const cleanBaselineForComparison = useMemo(() => {
    if (!baselinePayload) return "{}";
    const core = releaseGateCoreRequestBodyFromBaseline(baselinePayload);
    const cleaned = editableRequestBodyWithoutTools(core);
    return stringifyJson(cleaned);
  }, [baselinePayload]);

  const isJsonModified = candidateJsonValue !== cleanBaselineForComparison;

  const handleResetJsonToBaseline = useCallback(() => {
    if (editsLocked || !setRequestBody) return;
    if (!baselinePayload) return;
    setRequestBody(releaseGateCoreRequestBodyFromBaseline(baselinePayload));
    setRequestJsonDraft?.(null);
  }, [editsLocked, setRequestBody, baselinePayload, setRequestJsonDraft]);

  const systemPromptOverride = typeof requestBody.system_prompt === "string" ? requestBody.system_prompt : "";
  const isSystemPromptOverridden =
    systemPromptOverride.trim().length > 0 && systemPromptOverride.trim() !== runDataPrompt.trim();

  const handleResetSystemPrompt = useCallback(() => {
    if (editsLocked || !setRequestBody) return;
    setRequestBody(prev => {
      const next = { ...prev };
      delete (next as Record<string, unknown> & { system_prompt?: unknown }).system_prompt;
      return next;
    });
    setRequestJsonDraft?.(null);
  }, [editsLocked, setRequestBody, setRequestJsonDraft]);

  const activeProviderForModel = usingDetectedModel ? runDataProvider : replayProvider;
  const pinnedBadge =
    usingCustomModel &&
    activeProviderForModel === "anthropic" &&
    isPinnedAnthropicModelId(newModel)
      ? "Pinned"
      : usingCustomModel
        ? "Custom"
        : null;
  const showCustomModelWarning =
    usingCustomModel &&
    activeProviderForModel === "anthropic" &&
    newModel.trim().length > 0 &&
    (!isPinnedAnthropicModelId(newModel) || newModel.toLowerCase().includes("latest"));

  const updateRequestNumberField = useCallback(
    (key: "temperature" | "max_tokens" | "top_p", rawValue: string) => {
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
    },
    [editsLocked, setRequestBody]
  );

  return {
    activeProviderTab,
    setActiveProviderTab,
    candidateJsonValue,
    isJsonModified,
    handleResetJsonToBaseline,
    isSystemPromptOverridden,
    handleResetSystemPrompt,
    pinnedBadge,
    showCustomModelWarning,
    updateRequestNumberField,
  };
}

export type ReleaseGateConfigPanelCoreTabModel = ReturnType<typeof useReleaseGateConfigPanelCoreTabModel>;
