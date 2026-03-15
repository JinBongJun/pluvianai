import { apiClient, logWarn } from "./client";
import { validateArrayResponse } from "@/lib/validate";
import { DriftDetectionSchema } from "@/lib/schemas";

export const driftAPI = {
  detect: async (projectId: number, request: any) => {
    const response = await apiClient.post("/drift/detect", request, {
      params: { project_id: projectId },
    });
    return response.data;
  },

  list: async (projectId: number, params?: any) => {
    const response = await apiClient.get("/drift", {
      params: { project_id: projectId, ...params },
    });
    return validateArrayResponse(DriftDetectionSchema, response.data, "/drift");
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/drift/${id}`);
    try {
      return DriftDetectionSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] Drift detection ${id} schema mismatch`, { error });
      return response.data;
    }
  },
};
