import { apiClient } from "./client";
import { validateArrayResponse } from "@/lib/validate";
import { QualityScoreSchema } from "@/lib/schemas";

export const qualityAPI = {
  evaluate: async (projectId: number, request: any) => {
    const response = await apiClient.post(`/projects/${projectId}/quality/evaluate`, request);
    return response.data;
  },

  getScores: async (projectId: number, params?: any) => {
    const response = await apiClient.get(`/projects/${projectId}/quality/scores`, {
      params: { ...params },
    });
    const data = response.data?.data || response.data || [];
    return validateArrayResponse(QualityScoreSchema, data, "/quality/scores");
  },

  getStats: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get(`/projects/${projectId}/quality/stats`, {
      params: { days },
    });
    return response.data;
  },
};
