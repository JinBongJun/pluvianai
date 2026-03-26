"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { EditableTool, ReplayProvider } from "./releaseGatePageContent.lib";
import type { ReleaseGateModelSource } from "./releaseGateReplayConstants";
import {
  buildOpenAIStyleToolsFromEditableTools,
  inferProviderFromModelId,
} from "./releaseGatePageContent.lib";

export type UseReleaseGateToolsAndModelSyncParams = {
  toolsList: EditableTool[];
  setRequestBody: Dispatch<SetStateAction<Record<string, unknown>>>;
  modelSource: ReleaseGateModelSource;
  runDataModel: string;
  runDataProvider: ReplayProvider | null;
  setNewModel: Dispatch<SetStateAction<string>>;
  setReplayProvider: Dispatch<SetStateAction<ReplayProvider>>;
  setModelProviderTab: Dispatch<SetStateAction<ReplayProvider>>;
};

/** Mirrors editable tools into `requestBody.tools` for replay payload building. */
export function useReleaseGateToolsAndModelSync(p: UseReleaseGateToolsAndModelSyncParams) {
  const {
    toolsList,
    setRequestBody,
    modelSource,
    runDataModel,
    runDataProvider,
    setNewModel,
    setReplayProvider,
    setModelProviderTab,
  } = p;

  useEffect(() => {
    if (toolsList.length === 0) {
      setRequestBody(prev => {
        const next = { ...prev };
        delete next.tools;
        return next;
      });
      return;
    }
    const built = buildOpenAIStyleToolsFromEditableTools(toolsList);
    if (built.length) setRequestBody(prev => ({ ...prev, tools: built }));
  }, [toolsList, setRequestBody]);

  useEffect(() => {
    if (modelSource !== "detected") return;
    if (runDataModel) setNewModel(runDataModel);
    const inferredProvider = runDataProvider || inferProviderFromModelId(runDataModel);
    if (!inferredProvider) return;
    setReplayProvider(inferredProvider);
    setModelProviderTab(inferredProvider);
  }, [
    modelSource,
    runDataModel,
    runDataProvider,
    setNewModel,
    setReplayProvider,
    setModelProviderTab,
  ]);
}
