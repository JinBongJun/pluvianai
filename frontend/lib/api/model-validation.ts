import { apiClient, unwrapResponse } from "./client";

export const modelValidationAPI = {
  validateModel: async (
    projectId: number,
    data: { new_model: string; provider: string; rubric_id?: number }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/validate-model`, data);
    return unwrapResponse(response);
  },
};
