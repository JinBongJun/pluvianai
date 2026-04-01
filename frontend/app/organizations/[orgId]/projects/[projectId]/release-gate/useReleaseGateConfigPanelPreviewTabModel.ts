"use client";

import { useMemo } from "react";

import { stringifyJson, toReplayProvider } from "./releaseGateConfigPanelHelpers";
import type { ReleaseGateConfigPanelContextSlice } from "./releaseGateConfigPanelContextPick";
import { buildNodeRequestOverview } from "@/lib/requestOverview";

const idleCandidateRequestOverview = buildNodeRequestOverview({ payload: null });

export function useReleaseGateConfigPanelPreviewTabModel(
  c: ReleaseGateConfigPanelContextSlice,
  includeDetailedCandidatePreview: boolean
) {
  const {
    validateOverridePreview,
    finalCandidateRequest,
    runDataModel,
    runDataProvider,
    baselinePayload,
    baselineSeedSnapshotForOverview,
  } = c;

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

  const candidateRequestOverview = useMemo(() => {
    if (!includeDetailedCandidatePreview) return idleCandidateRequestOverview;
    return buildNodeRequestOverview({
      payload: finalCandidateRequest,
      provider: usingProvider,
      model: usingModel,
    });
  }, [includeDetailedCandidatePreview, finalCandidateRequest, usingProvider, usingModel]);

  const parityEnvironmentNotes = useMemo(() => {
    if (!includeDetailedCandidatePreview) return [];

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
        `Baseline included extended context keys that are not present in the candidate replay payload: ${missingExtended.join(", ")}. Add them in Core setup or Environment parity if replay still needs them.`
      );
    }

    const missingAdditional = baselineRequestOverview.additionalRequestKeys.filter(
      key => !candidateRequestOverview.additionalRequestKeys.includes(key)
    );
    if (missingAdditional.length > 0) {
      notes.push(
        `Baseline included extra request fields that are not present in the candidate replay payload: ${missingAdditional.join(", ")}. Add them in Environment parity when they matter for a faithful replay.`
      );
    }

    return notes;
  }, [includeDetailedCandidatePreview, baselineRequestOverview, candidateRequestOverview]);

  const parityCandidateShapeNotes = useMemo(() => {
    if (!includeDetailedCandidatePreview) return [];

    const notes: string[] = [];
    if (baselineRequestOverview.toolsCount > 0 && candidateRequestOverview.toolsCount === 0) {
      notes.push(
        "Baseline had tools in the request, but the candidate replay payload currently lists none. This may be an intentional model/tools experiment (Core setup) or an oversight—confirm before shipping."
      );
    }
    return notes;
  }, [includeDetailedCandidatePreview, baselineRequestOverview, candidateRequestOverview]);

  return {
    finalCandidateJson,
    usingModel,
    usingProvider,
    baselineRequestOverview,
    candidateRequestOverview,
    parityEnvironmentNotes,
    parityCandidateShapeNotes,
  };
}

export type ReleaseGateConfigPanelPreviewTabModel = ReturnType<
  typeof useReleaseGateConfigPanelPreviewTabModel
>;
