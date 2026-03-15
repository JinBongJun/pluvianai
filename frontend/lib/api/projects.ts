import { apiClient, unwrapResponse, logWarn } from "./client";
import { validateArrayResponse } from "@/lib/validate";
import { ProjectSchema } from "@/lib/schemas";

export const projectsAPI = {
  list: async (search?: string) => {
    const params = search ? { search } : {};
    const response = await apiClient.get("/projects", { params });
    return validateArrayResponse(ProjectSchema, response.data, "/projects");
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/projects/${id}`);
    try {
      return ProjectSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] Project ${id} schema mismatch`, { error });
      return response.data;
    }
  },

  getDataRetentionSummary: async (
    projectId: number
  ): Promise<{
    plan_type: string;
    retention_days: number;
    total_snapshots: number;
    expiring_soon: number;
    cutoff_date: string;
  }> => {
    const response = await apiClient.get(`/projects/${projectId}/data-retention-summary`);
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    generate_sample_data?: boolean;
    organization_id?: number;
    usage_mode?: "full" | "test_only";
  }) => {
    const response = await apiClient.post("/projects", {
      name: data.name,
      description: data.description,
      generate_sample_data: data.generate_sample_data,
      organization_id: data.organization_id,
      usage_mode: data.usage_mode ?? "full",
    });
    return response.data;
  },

  update: async (
    id: number,
    data?: { name?: string; description?: string; usage_mode?: "full" | "test_only" }
  ) => {
    const body: { name?: string; description?: string; usage_mode?: string } = {};
    if (data?.name !== undefined) body.name = data.name;
    if (data?.description !== undefined) body.description = data.description;
    if (data?.usage_mode !== undefined) body.usage_mode = data.usage_mode;
    const response = await apiClient.patch(`/projects/${id}`, body);
    return response.data;
  },

  delete: async (id: number) => {
    await apiClient.delete(`/projects/${id}`);
  },

  updateDiagnosticConfig: async (projectId: number, config: any) => {
    const response = await apiClient.patch(`/projects/${projectId}`, {
      diagnostic_config: config,
    });
    return unwrapResponse(response);
  },

  applyPatch: async (projectId: number, data: { nodes: any[]; edges: any[]; version?: string }) => {
    const response = await apiClient.post(`/projects/${projectId}/apply-patch`, data);
    return unwrapResponse(response);
  },
};

export const projectMembersAPI = {
  list: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/members`);
    return response.data;
  },

  add: async (projectId: number, userEmail: string, role: "admin" | "member" | "viewer") => {
    const response = await apiClient.post(`/projects/${projectId}/members`, {
      user_email: userEmail,
      role,
    });
    return response.data;
  },

  updateRole: async (projectId: number, userId: number, role: "admin" | "member" | "viewer") => {
    const response = await apiClient.patch(`/projects/${projectId}/members/${userId}`, {
      role,
    });
    return response.data;
  },

  remove: async (projectId: number, userId: number) => {
    await apiClient.delete(`/projects/${projectId}/members/${userId}`);
  },
};
