import { apiClient, logWarn } from "./client";
import { validateArrayResponse } from "@/lib/validate";
import { APICallSchema } from "@/lib/schemas";

export const apiCallsAPI = {
  list: async (projectId: number, params?: any) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const validatedParams = {
      ...params,
      limit: params?.limit ? Math.min(params.limit, 1000) : 100,
    };
    const response = await apiClient.get(`/projects/${Number(projectId)}/api-calls`, {
      params: validatedParams,
    });
    return validateArrayResponse(APICallSchema, response.data, "/api-calls");
  },

  get: async (projectId: number, id: number) => {
    const response = await apiClient.get(`/projects/${Number(projectId)}/api-calls/${id}`);
    try {
      return APICallSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] API call ${id} schema mismatch`, { error });
      return response.data;
    }
  },

  getStats: async (projectId: number, days: number = 7) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    if (days < 1 || days > 30) days = 7;
    const response = await apiClient.get(`/projects/${Number(projectId)}/api-calls/stats`, {
      params: { days: Number(days) },
    });
    return response.data;
  },

  streamRecent: async (projectId: number, limit: number = 25) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.get(`/projects/${Number(projectId)}/api-calls/stream/recent`, {
      params: { limit },
    });
    return response.data;
  },
};
