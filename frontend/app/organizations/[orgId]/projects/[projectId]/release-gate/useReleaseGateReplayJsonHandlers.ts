"use client";

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { releaseGateCoreRequestBodyFromBaseline } from "./releaseGatePageContent.lib";
import { sanitizeReplayBodyOverrides } from "./releaseGateReplayMerge";

export type UseReleaseGateReplayJsonHandlersParams = {
  bodyOverridesJsonDraft: string | null;
  requestBodyOverridesJson: string;
  bodyOverridesSnapshotDraftRaw: Record<string, string>;
  requestBodyOverridesBySnapshotId: Record<string, Record<string, unknown>>;
  requestJsonDraft: string | null;
  requestBodyJson: string;
  requestBody: Record<string, unknown>;
  baselinePayload: Record<string, unknown> | null;
  setRequestBodyOverrides: Dispatch<SetStateAction<Record<string, unknown>>>;
  setBodyOverridesJsonDraft: Dispatch<SetStateAction<string | null>>;
  setBodyOverridesJsonError: Dispatch<SetStateAction<string>>;
  setRequestBodyOverridesBySnapshotId: Dispatch<
    SetStateAction<Record<string, Record<string, unknown>>>
  >;
  setBodyOverridesSnapshotDraftRaw: Dispatch<SetStateAction<Record<string, string>>>;
  setBodyOverridesSnapshotJsonError: Dispatch<SetStateAction<Record<string, string>>>;
  setRequestBody: Dispatch<SetStateAction<Record<string, unknown>>>;
  setRequestJsonDraft: Dispatch<SetStateAction<string | null>>;
  setRequestJsonError: Dispatch<SetStateAction<string>>;
};

export function useReleaseGateReplayJsonHandlers(p: UseReleaseGateReplayJsonHandlersParams) {
  const {
    bodyOverridesJsonDraft,
    requestBodyOverridesJson,
    bodyOverridesSnapshotDraftRaw,
    requestBodyOverridesBySnapshotId,
    requestJsonDraft,
    requestBodyJson,
    requestBody,
    baselinePayload,
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
    setRequestBody,
    setRequestJsonDraft,
    setRequestJsonError,
  } = p;

  const handleBodyOverridesJsonBlur = useCallback(() => {
    const raw = bodyOverridesJsonDraft ?? requestBodyOverridesJson;
    const trimmed = raw.trim();
    if (!trimmed) {
      setRequestBodyOverrides({});
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setBodyOverridesJsonError("Must be a JSON object.");
        return;
      }
      setRequestBodyOverrides(sanitizeReplayBodyOverrides(parsed as Record<string, unknown>));
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
    } catch {
      setBodyOverridesJsonError("Invalid JSON.");
    }
  }, [bodyOverridesJsonDraft, requestBodyOverridesJson, setRequestBodyOverrides, setBodyOverridesJsonDraft, setBodyOverridesJsonError]);

  const clearBodyOverrides = useCallback(() => {
    setRequestBodyOverrides({});
    setBodyOverridesJsonDraft(null);
    setBodyOverridesJsonError("");
    setRequestBodyOverridesBySnapshotId({});
    setBodyOverridesSnapshotDraftRaw({});
    setBodyOverridesSnapshotJsonError({});
  }, [
    setRequestBodyOverrides,
    setBodyOverridesJsonDraft,
    setBodyOverridesJsonError,
    setRequestBodyOverridesBySnapshotId,
    setBodyOverridesSnapshotDraftRaw,
    setBodyOverridesSnapshotJsonError,
  ]);

  const handleBodyOverridesSnapshotBlur = useCallback(
    (sid: string) => {
      const raw =
        bodyOverridesSnapshotDraftRaw[sid] ??
        JSON.stringify(requestBodyOverridesBySnapshotId[sid] ?? {}, null, 2);
      const trimmed = raw.trim();
      if (!trimmed) {
        setRequestBodyOverridesBySnapshotId(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        setBodyOverridesSnapshotDraftRaw(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        setBodyOverridesSnapshotJsonError(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setBodyOverridesSnapshotJsonError(prev => ({ ...prev, [sid]: "Must be a JSON object." }));
          return;
        }
        setRequestBodyOverridesBySnapshotId(prev => ({
          ...prev,
          [sid]: sanitizeReplayBodyOverrides(parsed as Record<string, unknown>),
        }));
        setBodyOverridesSnapshotDraftRaw(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
        setBodyOverridesSnapshotJsonError(prev => {
          const n = { ...prev };
          delete n[sid];
          return n;
        });
      } catch {
        setBodyOverridesSnapshotJsonError(prev => ({ ...prev, [sid]: "Invalid JSON." }));
      }
    },
    [
      bodyOverridesSnapshotDraftRaw,
      requestBodyOverridesBySnapshotId,
      setRequestBodyOverridesBySnapshotId,
      setBodyOverridesSnapshotDraftRaw,
      setBodyOverridesSnapshotJsonError,
    ]
  );

  const applyLoadedGlobalBodyOverrides = useCallback(
    (obj: Record<string, unknown>) => {
      setRequestBodyOverrides(sanitizeReplayBodyOverrides(obj));
      setBodyOverridesJsonDraft(null);
      setBodyOverridesJsonError("");
    },
    [setRequestBodyOverrides, setBodyOverridesJsonDraft, setBodyOverridesJsonError]
  );

  const applyLoadedSnapshotBodyOverrides = useCallback(
    (sid: string, obj: Record<string, unknown>) => {
      const cleaned = sanitizeReplayBodyOverrides(obj);
      setRequestBodyOverridesBySnapshotId(prev => ({ ...prev, [sid]: cleaned }));
      setBodyOverridesSnapshotDraftRaw(prev => ({ ...prev, [sid]: JSON.stringify(cleaned, null, 2) }));
      setBodyOverridesSnapshotJsonError(prev => {
        const n = { ...prev };
        delete n[sid];
        return n;
      });
    },
    [
      setRequestBodyOverridesBySnapshotId,
      setBodyOverridesSnapshotDraftRaw,
      setBodyOverridesSnapshotJsonError,
    ]
  );

  const handleRequestJsonBlur = useCallback(() => {
    const raw = requestJsonDraft ?? requestBodyJson;
    const trimmed = raw.trim();
    if (!trimmed) {
      const next =
        Array.isArray(requestBody.tools) && requestBody.tools.length > 0
          ? { tools: requestBody.tools }
          : {};
      setRequestBody(next);
      setRequestJsonDraft(null);
      setRequestJsonError("");
      return;
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setRequestJsonError("Must be a JSON object.");
        return;
      }
      const obj = parsed as Record<string, unknown>;
      // Keep JSON editor focused on configuration-only fields.
      delete obj.model;
      delete (obj as any).system_prompt;
      delete (obj as any).messages;
      delete (obj as any).message;
      delete (obj as any).user_message;
      delete (obj as any).response;
      delete (obj as any).responses;
      delete (obj as any).input;
      delete (obj as any).inputs;
      delete (obj as any).trace_id;
      delete (obj as any).agent_id;
      delete (obj as any).agent_name;
      if (Array.isArray(requestBody.tools) && requestBody.tools.length > 0) {
        obj.tools = requestBody.tools;
      }
      setRequestBody(obj);
      setRequestJsonDraft(null);
      setRequestJsonError("");
    } catch {
      setRequestJsonError("Invalid JSON.");
    }
  }, [requestBody, requestBodyJson, requestJsonDraft, setRequestBody, setRequestJsonDraft, setRequestJsonError]);

  const handleResetRequestJson = useCallback(() => {
    if (!baselinePayload) return;
    setRequestBody(releaseGateCoreRequestBodyFromBaseline(baselinePayload));
    setRequestJsonDraft(null);
    setRequestJsonError("");
  }, [baselinePayload, setRequestBody, setRequestJsonDraft, setRequestJsonError]);

  return {
    handleBodyOverridesJsonBlur,
    clearBodyOverrides,
    handleBodyOverridesSnapshotBlur,
    applyLoadedGlobalBodyOverrides,
    applyLoadedSnapshotBodyOverrides,
    handleRequestJsonBlur,
    handleResetRequestJson,
  };
}
