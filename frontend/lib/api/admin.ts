import { apiClient, unwrapResponse } from "./client";

export const adminAPI = {
  generateSampleData: async (projectId: number) => {
    const response = await apiClient.post("/admin/generate-sample-data", null, {
      params: { project_id: projectId },
    });
    return unwrapResponse(response);
  },

  getCurrentUser: async () => {
    const response = await apiClient.get("/auth/me");
    return unwrapResponse(response);
  },

  getStats: async () => {
    const response = await apiClient.get("/admin/stats");
    return unwrapResponse(response);
  },

  listUsers: async (params?: { limit?: number; offset?: number; search?: string }) => {
    const response = await apiClient.get("/admin/users", { params });
    return unwrapResponse(response);
  },

  startImpersonation: async (
    userId: number,
    data: { reason?: string; duration_minutes?: number }
  ) => {
    const response = await apiClient.post(`/admin/users/${userId}/impersonate`, data);
    return unwrapResponse(response);
  },

  endImpersonation: async (sessionId: string) => {
    const response = await apiClient.delete(`/admin/impersonate/${sessionId}`);
    return unwrapResponse(response);
  },
};
