import { apiClient } from "./client";

export const testRunsAPI = {
  create: async (projectId: number, data: { nodes: any[]; edges: any[] }) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.post("/test-runs/runs", data, {
      params: { project_id: Number(projectId) },
    });
    return response.data;
  },
};
