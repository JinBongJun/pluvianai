"use client";

import { useCallback, useState } from "react";

import { liveViewAPI } from "@/lib/api";
import { getProjectPermissionToast } from "@/lib/projectAccess";

type ToastApi = {
  showToast: (message: string, tone?: "success" | "error" | "warning" | "info") => void;
};

export function useLiveViewDestructiveActions(options: {
  projectId: number;
  selectedAgentId: string | null;
  setSelectedAgentId: (agentId: string | null) => void;
  setPanelTab: (tab: "issues" | "saved" | "checks" | "settings") => void;
  mutateAgents: (data?: unknown, shouldRevalidate?: boolean) => Promise<unknown>;
  resetHistory: () => void;
  toast: ToastApi;
}) {
  const {
    projectId,
    selectedAgentId,
    setSelectedAgentId,
    setPanelTab,
    mutateAgents,
    resetHistory,
    toast,
  } = options;

  const [restoringAgentId, setRestoringAgentId] = useState<string | null>(null);
  const [hardDeletingAgents, setHardDeletingAgents] = useState(false);

  const handleHardDeleteAgents = useCallback(
    async (agentIds: string[]) => {
      if (!projectId || Number.isNaN(projectId) || agentIds.length === 0) return;
      const confirmed = window.confirm(
        `Permanently purge ${agentIds.length} deleted node(s) and their Live View data? This action cannot be undone.`
      );
      if (!confirmed) return;

      setHardDeletingAgents(true);
      try {
        const result = await liveViewAPI.hardDeleteAgents(projectId, agentIds);
        if (selectedAgentId && agentIds.includes(selectedAgentId)) {
          setSelectedAgentId(null);
          setPanelTab("issues");
        }
        await mutateAgents(undefined, true);
        resetHistory();
        const deletedSnapshots = Number(result?.deleted_snapshots ?? 0);
        toast.showToast(
          agentIds.length === 1
            ? `Permanently purged 1 deleted node${deletedSnapshots > 0 ? ` and ${deletedSnapshots} log${deletedSnapshots === 1 ? "" : "s"}` : ""}.`
            : `Permanently purged ${agentIds.length} deleted nodes${deletedSnapshots > 0 ? ` and ${deletedSnapshots} logs` : ""}.`,
          "success"
        );
      } catch (error: any) {
        const permissionToast = getProjectPermissionToast({
          featureLabel: "Permanently deleting nodes",
          error,
        });
        const message =
          permissionToast?.message ??
          error?.response?.data?.detail ??
          "Failed to permanently delete nodes. Please try again.";
        toast.showToast(message, permissionToast?.tone ?? "error");
      } finally {
        setHardDeletingAgents(false);
      }
    },
    [
      mutateAgents,
      projectId,
      resetHistory,
      selectedAgentId,
      setPanelTab,
      setSelectedAgentId,
      toast,
    ]
  );

  const handleRestoreAgent = useCallback(
    async (agentId: string) => {
      if (!projectId || !agentId) return;
      setRestoringAgentId(agentId);
      try {
        await liveViewAPI.restoreAgent(projectId, agentId);
        await mutateAgents(undefined, true);
        setSelectedAgentId(agentId);
        setPanelTab("issues");
        toast.showToast("Node restored to Live View.", "success");
      } catch (error: unknown) {
        const permissionToast = getProjectPermissionToast({
          featureLabel: "Restoring nodes",
          error,
        });
        const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        toast.showToast(
          permissionToast?.message ?? (typeof message === "string" ? message : "Failed to restore node."),
          permissionToast?.tone ?? "error"
        );
      } finally {
        setRestoringAgentId(null);
      }
    },
    [mutateAgents, projectId, setPanelTab, setSelectedAgentId, toast]
  );

  return {
    restoringAgentId,
    hardDeletingAgents,
    handleHardDeleteAgents,
    handleRestoreAgent,
  };
}
