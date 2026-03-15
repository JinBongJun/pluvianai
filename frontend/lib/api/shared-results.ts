import { apiClient, unwrapResponse } from "./client";

export const sharedResultsAPI = {
  shareResult: async (
    projectId: number,
    resultId: number,
    data: {
      result_type: string;
      result_data: any;
      expires_in_days?: number;
    }
  ) => {
    const response = await apiClient.post(
      `/projects/${projectId}/results/${resultId}/share`,
      data
    );
    return unwrapResponse(response);
  },

  share: async (
    projectId: number,
    data: {
      result_type: string;
      result_data: any;
      result_id?: number;
      expires_in_days?: number;
    }
  ) => {
    if (data.result_id) {
      const response = await apiClient.post(
        `/projects/${projectId}/results/${data.result_id}/share`,
        {
          result_type: data.result_type,
          result_data: data.result_data,
          expires_in_days: data.expires_in_days,
        }
      );
      return unwrapResponse(response);
    }
    const response = await apiClient.post(`/projects/${projectId}/results/0/share`, {
      result_type: data.result_type,
      result_data: data.result_data,
      expires_in_days: data.expires_in_days,
    });
    return unwrapResponse(response);
  },

  getShared: async (token: string) => {
    const response = await apiClient.get(`/shared/${token}`);
    return unwrapResponse(response);
  },
};
