import { apiClient, unwrapResponse } from "./client";

export const liveViewAPI = {
  getAgents: async (projectId: number, limit: number = 30, includeDeleted: boolean = false) => {
    const response = await apiClient.get(`/projects/${projectId}/live-view/agents`, {
      params: { limit, include_deleted: includeDeleted },
    });
    return unwrapResponse(response);
  },

  getAgentSettings: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.get(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/settings`
    );
    return unwrapResponse(response);
  },

  updateAgentSettings: async (
    projectId: number,
    agentId: string,
    data: { display_name?: string; is_deleted?: boolean; diagnostic_config?: any }
  ) => {
    const safeAgentId = encodeURIComponent(agentId);
    const { diagnostic_config, ...params } = data;
    const response = await apiClient.patch(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/settings`,
      diagnostic_config,
      { params }
    );
    return unwrapResponse(response);
  },

  deleteAgent: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    await apiClient.delete(`/projects/${projectId}/live-view/agents/${safeAgentId}`);
  },

  restoreAgent: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.post(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/restore`
    );
    return unwrapResponse(response);
  },

  listSnapshots: async (
    projectId: number,
    params: {
      agent_id?: string;
      is_worst?: boolean;
      light?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/snapshots`, { params });
    return unwrapResponse(response);
  },

  getSnapshot: async (projectId: number, snapshotId: string | number) => {
    const response = await apiClient.get(
      `/projects/${projectId}/snapshots/${encodeURIComponent(String(snapshotId))}`
    );
    return unwrapResponse(response);
  },

  deleteSnapshot: async (projectId: number, snapshotId: string | number) => {
    const response = await apiClient.delete(
      `/projects/${projectId}/snapshots/${encodeURIComponent(String(snapshotId))}`
    );
    return unwrapResponse(response) as { ok: boolean; deleted: number };
  },

  deleteSnapshotsBatch: async (projectId: number, snapshotIds: number[]) => {
    const response = await apiClient.post(`/projects/${projectId}/snapshots/batch-delete`, {
      snapshot_ids: snapshotIds,
    });
    return unwrapResponse(response) as { ok: boolean; deleted: number };
  },

  getAgentEvaluation: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.get(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/evaluation`
    );
    return unwrapResponse(response);
  },

  listSavedLogs: async (
    projectId: number,
    agentId: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<{
    items: Array<{
      id: number;
      snapshot_id: number;
      trace_id?: string | null;
      agent_id?: string | null;
      provider?: string | null;
      model?: string | null;
      status_code?: number | null;
      latency_ms?: number | null;
      eval_checks_result?: Record<string, unknown> | null;
      snapshot_created_at?: string | null;
      saved_at?: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.get(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs`,
      { params }
    );
    return unwrapResponse(response);
  },

  saveLogs: async (
    projectId: number,
    agentId: string,
    snapshotIds: number[]
  ): Promise<{
    ok: boolean;
    saved_count: number;
    already_saved_count: number;
    missing_snapshot_ids?: number[];
    mismatched_snapshot_ids?: number[];
  }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.post(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs`,
      { snapshot_ids: snapshotIds }
    );
    return unwrapResponse(response);
  },

  deleteSavedLogs: async (
    projectId: number,
    agentId: string,
    snapshotIds: number[]
  ): Promise<{ ok: boolean; deleted: number }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.post(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs/batch-delete`,
      { snapshot_ids: snapshotIds }
    );
    return unwrapResponse(response);
  },

  clearSavedLogs: async (
    projectId: number,
    agentId: string
  ): Promise<{ ok: boolean; deleted: number }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.delete(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs`
    );
    return unwrapResponse(response);
  },
};
