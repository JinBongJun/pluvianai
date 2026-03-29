import { apiClient, unwrapResponse } from "./client";

/** Optional hints when request bodies were omitted or truncated (SDK / ingest). */
export type RequestContextMeta = {
  omitted_by_policy?: boolean;
  truncated?: boolean;
  request_text_omitted?: boolean;
  response_text_omitted?: boolean;
  request_truncated?: boolean;
  payload_truncated?: boolean;
};

/** Backend-derived replay-relevant request summary for a snapshot. */
export type LiveViewRequestOverview = {
  provider?: string | null;
  model?: string | null;
  message_count?: number | null;
  tools_count?: number | null;
  temperature?: number | null;
  top_p?: number | null;
  max_tokens?: number | null;
  request_control_keys?: string[] | null;
  extended_context_keys?: string[] | null;
  additional_request_keys?: string[] | null;
  omitted_by_policy?: boolean;
  truncated?: boolean;
  capture_state?: "complete" | "policy_limited" | "truncated" | string;
};

/** `GET .../snapshots` list item — light list can include `has_tool_results` without loading full timeline. */
export type LiveViewSnapshotListItem = {
  id: number;
  has_tool_calls?: boolean;
  has_tool_results?: boolean;
  tool_calls_summary?: unknown[];
  /** Present when stored payload omits/truncates bodies (same derivation as GET snapshot). */
  request_context_meta?: RequestContextMeta | null;
  request_overview?: LiveViewRequestOverview | null;
  [key: string]: unknown;
};

/** `GET /projects/:id/snapshots/:snapshotId` — `tool_timeline[]` (ingest + persisted trajectory). */
export type LiveViewToolTimelineRow = {
  step_order: number;
  step_type: string;
  tool_name?: string | null;
  tool_args?: Record<string, unknown>;
  tool_result?: Record<string, unknown> | null;
  latency_ms?: number | null;
  provenance?: "trajectory" | "payload";
  /** Release Gate replay / tool evidence (optional) */
  execution_source?: string;
  tool_result_source?: string;
  match_tier?: string;
};

/** Snapshot detail includes redacted tool_timeline + version for §14.2. */
export type LiveViewSnapshotDetail = {
  tool_timeline?: LiveViewToolTimelineRow[];
  tool_timeline_redaction_version?: number;
  /** Set from stored payload markers when SDK omitted/truncated bodies (see docs/live-view-context-privacy-plan.md). */
  request_context_meta?: RequestContextMeta | null;
  request_overview?: LiveViewRequestOverview | null;
  [key: string]: unknown;
};

export const liveViewAPI = {
  getAgents: async (
    projectId: number,
    limit: number = 30,
    includeDeleted: boolean = false,
    compact: boolean = false
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/live-view/agents`, {
      params: { limit, include_deleted: includeDeleted, compact },
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

  hardDeleteAgents: async (projectId: number, agentIds: string[]) => {
    const response = await apiClient.post(`/projects/${projectId}/live-view/agents/hard-delete`, {
      agent_ids: agentIds,
    });
    return unwrapResponse(response) as {
      ok: boolean;
      deleted_agent_settings: number;
      deleted_snapshots: number;
      deleted_saved_logs: number;
      deleted_trajectory_steps: number;
      deleted_agent_eval_history: number;
      deleted_user_api_keys: number;
    };
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

  listDeletedSnapshots: async (
    projectId: number,
    params: { days?: number; limit?: number; offset?: number } = {}
  ): Promise<{
    items: Array<{
      id: number;
      trace_id?: string | null;
      agent_id?: string | null;
      model?: string | null;
      status_code?: number | null;
      created_at?: string | null;
      deleted_at?: string | null;
    }>;
    count: number;
    total_count: number;
    limit: number;
    offset: number;
    window_days: number;
  }> => {
    const response = await apiClient.get(`/projects/${projectId}/snapshots/deleted`, { params });
    return unwrapResponse(response);
  },

  restoreSnapshot: async (projectId: number, snapshotId: string | number) => {
    const response = await apiClient.post(
      `/projects/${projectId}/snapshots/${encodeURIComponent(String(snapshotId))}/restore`
    );
    return unwrapResponse(response) as { ok: boolean; restored: number };
  },

  restoreSnapshotsBatch: async (projectId: number, snapshotIds: number[]) => {
    const response = await apiClient.post(`/projects/${projectId}/snapshots/deleted/batch-restore`, {
      snapshot_ids: snapshotIds,
    });
    return unwrapResponse(response) as { ok: boolean; restored: number };
  },

  permanentlyDeleteSnapshots: async (projectId: number, snapshotIds: number[]) => {
    const response = await apiClient.post(
      `/projects/${projectId}/snapshots/deleted/permanent-delete`,
      {
        snapshot_ids: snapshotIds,
      }
    );
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
