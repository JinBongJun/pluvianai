import { apiClient, unwrapResponse } from "./client";

export const dashboardAPI = {
  getMetrics: async (projectId: number, period: "24h" | "7d" | "30d" = "24h") => {
    const response = await apiClient.get(`/projects/${projectId}/dashboard/metrics`, {
      params: { period },
    });
    return unwrapResponse(response);
  },

  getTrends: async (
    projectId: number,
    period: "1d" | "7d" | "30d" | "90d" = "7d",
    groupBy: "hour" | "day" | "week" = "hour"
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/dashboard/trends`, {
      params: { period, group_by: groupBy },
    });
    return unwrapResponse(response);
  },
};
