import { apiClient, logWarn } from "./client";
import { validateArrayResponse } from "@/lib/validate";
import { AlertSchema } from "@/lib/schemas";

export const alertsAPI = {
  list: async (projectId: number, params?: any) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const validatedParams = {
      ...params,
      limit: params?.limit ? Math.min(params.limit, 1000) : 100,
    };
    const response = await apiClient.get(`/projects/${Number(projectId)}/alerts`, {
      params: validatedParams,
    });
    return validateArrayResponse(AlertSchema, response.data, "/alerts");
  },

  get: async (projectId: number, id: number) => {
    const response = await apiClient.get(`/projects/${Number(projectId)}/alerts/${id}`);
    try {
      return AlertSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] Alert ${id} schema mismatch`, { error });
      return response.data;
    }
  },

  resolve: async (projectId: number, id: number) => {
    const response = await apiClient.post(`/projects/${Number(projectId)}/alerts/${id}/resolve`);
    return response.data;
  },

  send: async (projectId: number, id: number, channels?: string[]) => {
    const response = await apiClient.post(
      `/projects/${Number(projectId)}/alerts/${id}/send`,
      { channels }
    );
    return response.data;
  },
};
