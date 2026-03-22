import type { ReleaseGateResult, ReleaseGateHistoryResponse } from "./types";
import { apiClient } from "./client";

export type ToolContextInjectPayload = {
  scope: "per_snapshot" | "global";
  global_text?: string;
  by_snapshot_id?: Record<string, string>;
};

export type ToolContextPayload = {
  mode: "recorded" | "inject";
  inject?: ToolContextInjectPayload;
};

type ReleaseGateValidatePayload = {
  agent_id?: string;
  use_recent_snapshots?: boolean;
  recent_snapshot_limit?: number;
  trace_id?: string;
  dataset_id?: string;
  dataset_ids?: string[];
  snapshot_ids?: string[];
  baseline_trace_id?: string;
  model_source?: "detected" | "platform";
  new_model?: string;
  replay_provider?: "openai" | "anthropic" | "google";
  replay_api_key?: string;
  new_system_prompt?: string;
  replay_temperature?: number;
  replay_max_tokens?: number;
  replay_top_p?: number;
  replay_overrides?: Record<string, unknown>;
  /** Per snapshot id; merged after global replay_overrides on the server. */
  replay_overrides_by_snapshot_id?: Record<string, Record<string, unknown>>;
  tool_context?: ToolContextPayload;
  rule_ids?: string[];
  max_snapshots?: number;
  repeat_runs?: number;
  evaluation_mode?: "replay_test";
  fail_rate_max?: number;
  flaky_rate_max?: number;
};

export const releaseGateAPI = {
  getCoreModels: async (
    projectId: number
  ): Promise<{
    providers: Record<"openai" | "anthropic" | "google", string[]>;
  }> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/core-models`);
    return response.data;
  },

  getAgents: async (
    projectId: number,
    limit: number = 50
  ): Promise<{ items: { agent_id: string; display_name: string }[] }> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/agents`, {
      params: { limit },
    });
    return response.data;
  },

  getRecentSnapshots: async (
    projectId: number,
    agentId: string,
    limit: number = 20
  ): Promise<{
    items: { id: string; trace_id: string; created_at: string }[];
    total: number;
    total_available?: number;
  }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/release-gate/agents/${encodeURIComponent(agentId)}/recent-snapshots`,
      { params: { limit } }
    );
    return response.data;
  },

  getRecommendedSnapshots: async (
    projectId: number,
    agentId: string
  ): Promise<{
    snapshot_ids: string[];
    worst_snapshot_ids?: number[];
    golden_snapshot_ids?: number[];
    fill_snapshot_ids?: number[];
    worst_items?: { id: number; trace_id?: string | null; created_at?: string | null }[];
    golden_items?: { id: number; trace_id?: string | null; created_at?: string | null }[];
    fill_items?: { id: number; trace_id?: string | null; created_at?: string | null }[];
    meta: { worst: number; golden: number; window_days: number };
    label?: string;
  }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/release-gate/agents/${encodeURIComponent(agentId)}/recommended-snapshots`
    );
    const data = response.data;
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const rawIds = Array.isArray(raw.snapshot_ids) ? raw.snapshot_ids : [];
    const meta =
      raw.meta && typeof raw.meta === "object"
        ? (raw.meta as { worst: number; golden: number; window_days: number })
        : { worst: 0, golden: 0, window_days: 7 };
    const toNumIds = (arr: unknown): number[] =>
      Array.isArray(arr)
        ? arr.map(x => (typeof x === "number" ? x : Number(x))).filter(Number.isFinite)
        : [];
    const toItems = (
      arr: unknown
    ): { id: number; trace_id?: string | null; created_at?: string | null }[] =>
      Array.isArray(arr)
        ? arr.map(item => {
            const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const id = typeof o.id === "number" ? o.id : Number(o.id);
            return {
              id: Number.isFinite(id) ? id : 0,
              trace_id:
                typeof o.trace_id === "string"
                  ? o.trace_id
                  : o.trace_id == null
                    ? null
                    : String(o.trace_id),
              created_at:
                typeof o.created_at === "string"
                  ? o.created_at
                  : o.created_at == null
                    ? null
                    : String(o.created_at),
            };
          })
        : [];
    return {
      snapshot_ids: rawIds.map(x => String(x)),
      worst_snapshot_ids: toNumIds(raw.worst_snapshot_ids),
      golden_snapshot_ids: toNumIds(raw.golden_snapshot_ids),
      fill_snapshot_ids: toNumIds(raw.fill_snapshot_ids),
      worst_items: toItems(raw.worst_items),
      golden_items: toItems(raw.golden_items),
      fill_items: toItems(raw.fill_items),
      meta,
      label: typeof raw.label === "string" ? raw.label : undefined,
    };
  },

  validate: async (
    projectId: number,
    data: ReleaseGateValidatePayload
  ): Promise<ReleaseGateResult> => {
    const response = await apiClient.post(`/projects/${projectId}/release-gate/validate`, data);
    return response.data;
  },

  validateAsync: async (
    projectId: number,
    data: ReleaseGateValidatePayload
  ): Promise<{
    job: {
      id: string;
      status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      created_at?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      cancel_requested_at?: string | null;
      progress: { done: number; total?: number | null; phase?: string | null };
      report_id?: string | null;
      error_detail?: Record<string, unknown> | null;
    };
  }> => {
    const response = await apiClient.post(
      `/projects/${projectId}/release-gate/validate-async`,
      data
    );
    return response.data;
  },

  getJob: async (
    projectId: number,
    jobId: string,
    includeResult: 0 | 1 = 0
  ): Promise<{
    job: {
      id: string;
      status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      created_at?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      cancel_requested_at?: string | null;
      progress: { done: number; total?: number | null; phase?: string | null };
      report_id?: string | null;
      error_detail?: Record<string, unknown> | null;
    };
    result?: ReleaseGateResult | null;
  }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/release-gate/jobs/${encodeURIComponent(jobId)}`,
      { params: { include_result: includeResult }, timeout: 10000 }
    );
    return response.data;
  },

  cancelJob: async (
    projectId: number,
    jobId: string
  ): Promise<{
    job: {
      id: string;
      status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      created_at?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      cancel_requested_at?: string | null;
      progress: { done: number; total?: number | null; phase?: string | null };
      report_id?: string | null;
      error_detail?: Record<string, unknown> | null;
    };
  }> => {
    const response = await apiClient.post(
      `/projects/${projectId}/release-gate/jobs/${encodeURIComponent(jobId)}/cancel`
    );
    return response.data;
  },

  suggestBaseline: async (
    projectId: number,
    params: { trace_id: string; agent_id?: string }
  ): Promise<{
    baseline_trace_id: string | null;
    source?: string | null;
    report_id?: string | null;
    agent_id?: string | null;
    created_at?: string | null;
  }> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/suggest-baseline`, {
      params,
    });
    return response.data;
  },

  listHistory: async (
    projectId: number,
    params?: { status?: "pass" | "fail"; trace_id?: string; limit?: number; offset?: number }
  ): Promise<ReleaseGateHistoryResponse> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/history`, {
      params,
    });
    return response.data;
  },
};
