"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { EditableTool } from "./releaseGatePageContent.lib";

export type UseReleaseGateAgentLifecycleParams = {
  agentIdFromUrl: string;
  agentId: string;
  clearRunUi: () => void;
  setAgentId: (id: string) => void;
  setViewMode: (mode: "map" | "expanded") => void;
  setRequestBody: Dispatch<SetStateAction<Record<string, unknown>>>;
  setRequestJsonDraft: Dispatch<SetStateAction<string | null>>;
  setRequestJsonError: Dispatch<SetStateAction<string>>;
  setToolsList: Dispatch<SetStateAction<EditableTool[]>>;
  setToolContextMode: Dispatch<SetStateAction<"recorded" | "inject">>;
  setToolContextScope: Dispatch<SetStateAction<"global" | "per_snapshot">>;
  setToolContextGlobalText: Dispatch<SetStateAction<string>>;
  setToolContextBySnapshotId: Dispatch<SetStateAction<Record<string, string>>>;
  setToolContextLoadBusy: Dispatch<SetStateAction<boolean>>;
  setRepresentativeBaselineUserSnapshotId: Dispatch<SetStateAction<string | null>>;
};

export function useReleaseGateAgentLifecycle(p: UseReleaseGateAgentLifecycleParams) {
  const {
    agentIdFromUrl,
    agentId,
    clearRunUi,
    setAgentId,
    setViewMode,
    setRequestBody,
    setRequestJsonDraft,
    setRequestJsonError,
    setToolsList,
    setToolContextMode,
    setToolContextScope,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    setToolContextLoadBusy,
    setRepresentativeBaselineUserSnapshotId,
  } = p;

  useEffect(() => {
    if (!agentIdFromUrl) return;
    setAgentId(agentIdFromUrl);
    setViewMode("expanded");
  }, [agentIdFromUrl, setAgentId, setViewMode]);

  useEffect(() => {
    if (!agentId) {
      setRequestBody({});
      setRequestJsonDraft(null);
      setRequestJsonError("");
      setToolsList([]);
      setToolContextMode("recorded");
      setToolContextScope("per_snapshot");
      setToolContextGlobalText("");
      setToolContextBySnapshotId({});
      setToolContextLoadBusy(false);
      setRepresentativeBaselineUserSnapshotId(null);
      clearRunUi();
      return;
    }
    setRequestBody({});
    setRequestJsonDraft(null);
    setRequestJsonError("");
    setToolsList([]);
    setToolContextMode("recorded");
    setToolContextScope("per_snapshot");
    setToolContextGlobalText("");
    setToolContextBySnapshotId({});
    setToolContextLoadBusy(false);
    setRepresentativeBaselineUserSnapshotId(null);
    clearRunUi();
  }, [
    agentId,
    clearRunUi,
    setRequestBody,
    setRequestJsonDraft,
    setRequestJsonError,
    setToolsList,
    setToolContextMode,
    setToolContextScope,
    setToolContextGlobalText,
    setToolContextBySnapshotId,
    setToolContextLoadBusy,
    setRepresentativeBaselineUserSnapshotId,
  ]);
}
