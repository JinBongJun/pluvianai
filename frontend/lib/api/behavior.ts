import type { BehaviorRule, ValidationReport, CompareResult, CIGateResult } from "./types";
import { apiClient, unwrapArrayResponse } from "./client";

export const behaviorAPI = {
  listRules: async (
    projectId: number,
    params?: { enabled?: boolean; scope_type?: "project" | "agent" | "canvas"; scope_ref?: string }
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/behavior/rules`, { params });
    return unwrapArrayResponse(response) as BehaviorRule[];
  },

  createRule: async (
    projectId: number,
    data: Omit<BehaviorRule, "id" | "created_at" | "updated_at" | "project_id">
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/rules`, data);
    return response.data;
  },

  updateRule: async (
    projectId: number,
    ruleId: string,
    data: Partial<Omit<BehaviorRule, "id" | "created_at" | "updated_at" | "project_id">>
  ) => {
    const response = await apiClient.put(
      `/projects/${projectId}/behavior/rules/${encodeURIComponent(ruleId)}`,
      data
    );
    return response.data;
  },

  deleteRule: async (projectId: number, ruleId: string) => {
    await apiClient.delete(`/projects/${projectId}/behavior/rules/${encodeURIComponent(ruleId)}`);
  },

  listReports: async (
    projectId: number,
    params?: {
      agent_id?: string;
      status?: "pass" | "fail";
      limit?: number;
      offset?: number;
    }
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/behavior/reports`, { params });
    return response.data;
  },

  exportReport: async (projectId: number, reportId: string, format: "json" | "csv" = "json") => {
    if (format === "csv") {
      const response = await apiClient.get(
        `/projects/${projectId}/behavior/reports/${reportId}/export`,
        { params: { format: "csv" }, responseType: "blob" }
      );
      return response.data;
    }
    const response = await apiClient.get(
      `/projects/${projectId}/behavior/reports/${reportId}/export`,
      { params: { format: "json" } }
    );
    return response.data;
  },

  validate: async (
    projectId: number,
    data: {
      trace_id?: string;
      test_run_id?: string;
      rule_ids?: string[];
      baseline_run_ref?: string;
    }
  ): Promise<ValidationReport> => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/validate`, data);
    return response.data;
  },

  compare: async (
    projectId: number,
    data: {
      baseline_test_run_id: string;
      candidate_test_run_id: string;
      rule_ids?: string[];
    }
  ): Promise<CompareResult> => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/compare`, data);
    return response.data;
  },

  ciGate: async (
    projectId: number,
    data: {
      baseline_test_run_id?: string;
      candidate_test_run_id: string;
      rule_ids?: string[];
      thresholds?: {
        critical?: number;
        high?: number;
        medium?: number;
        low?: number;
        critical_delta?: number;
        high_delta?: number;
        medium_delta?: number;
        low_delta?: number;
      };
    }
  ): Promise<CIGateResult> => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/ci-gate`, data);
    return response.data;
  },

  createDataset: async (
    projectId: number,
    data: {
      trace_ids?: string[];
      snapshot_ids?: number[];
      agent_id?: string;
      label?: string;
      tag?: string;
      eval_config_snapshot?: Record<string, unknown>;
      policy_ruleset_snapshot?: Array<{
        id: string;
        revision?: string;
        rule_json: Record<string, unknown>;
      }>;
      ruleset_hash?: string;
    }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/datasets`, data);
    return response.data;
  },

  createDatasetsBatch: async (
    projectId: number,
    payload: {
      items: Array<{
        snapshot_ids?: number[];
        agent_id?: string;
        label?: string;
        eval_config_snapshot?: Record<string, unknown>;
        policy_ruleset_snapshot?: Array<{
          id: string;
          revision?: string;
          rule_json: Record<string, unknown>;
        }>;
      }>;
    }
  ): Promise<{
    created: Array<Record<string, unknown>>;
    errors?: Array<{ index: number; message: string }>;
  }> => {
    const response = await apiClient.post(
      `/projects/${projectId}/behavior/datasets/batch`,
      payload
    );
    return response.data;
  },

  listDatasets: async (
    projectId: number,
    params?: { agent_id?: string; limit?: number; offset?: number; summary?: boolean }
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/behavior/datasets`, {
      params: { summary: true, ...params },
    });
    return response.data;
  },

  getDataset: async (projectId: number, datasetId: string) => {
    const response = await apiClient.get(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}`
    );
    return response.data;
  },

  getDatasetSnapshots: async (
    projectId: number,
    datasetId: string
  ): Promise<{ items: any[]; total: number }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}/snapshots`
    );
    const data = response.data;
    if (data && typeof data === "object" && "items" in data) return data;
    return { items: [], total: 0 };
  },

  updateDataset: async (
    projectId: number,
    datasetId: string,
    body: { snapshot_ids?: number[]; label?: string }
  ): Promise<{ id: string; snapshot_ids: number[]; label?: string | null }> => {
    const response = await apiClient.patch(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}`,
      body
    );
    return response.data;
  },

  deleteDataset: async (projectId: number, datasetId: string) => {
    await apiClient.post(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}/delete`
    );
  },

  deleteDatasetsBatch: async (projectId: number, datasetIds: string[]) => {
    if (datasetIds.length === 0) return;
    const response = await apiClient.post<{ ok: boolean; deleted: number }>(
      `/projects/${projectId}/behavior/datasets/batch-delete`,
      { dataset_ids: datasetIds }
    );
    return response.data;
  },
};
