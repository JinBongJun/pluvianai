import { apiClient, unwrapResponse } from "./client";

export const judgeFeedbackAPI = {
  createFeedback: async (
    projectId: number,
    data: {
      evaluation_id: number;
      judge_score: number;
      human_score: number;
      comment?: string;
      correction_reason?: string;
      metadata?: any;
    }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/judge/feedback`, data);
    return unwrapResponse(response);
  },

  getFeedback: async (projectId: number, evaluationId?: number) => {
    const params: any = {};
    if (evaluationId) params.evaluation_id = evaluationId;
    const response = await apiClient.get(`/projects/${projectId}/judge/feedback`, { params });
    return unwrapResponse(response);
  },

  updateFeedback: async (
    projectId: number,
    feedbackId: number,
    data: {
      human_score?: number;
      comment?: string;
      correction_reason?: string;
      metadata?: any;
    }
  ) => {
    const response = await apiClient.put(
      `/projects/${projectId}/judge/feedback/${feedbackId}`,
      data
    );
    return unwrapResponse(response);
  },

  getReliabilityMetrics: async (projectId: number, days: number = 30) => {
    const response = await apiClient.get(`/projects/${projectId}/judge/reliability`, {
      params: { days },
    });
    return unwrapResponse(response);
  },

  runMetaValidation: async (
    projectId: number,
    evaluationId: number,
    primaryJudge: string,
    secondaryJudge: string
  ) => {
    const response = await apiClient.post(
      `/projects/${projectId}/judge/meta-validate/${evaluationId}`,
      null,
      {
        params: {
          primary_judge_model: primaryJudge,
          secondary_judge_model: secondaryJudge,
        },
      }
    );
    return unwrapResponse(response);
  },
};
