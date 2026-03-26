import { apiClient } from "./client";

export const replayAPI = {
  runBatchReplay: async (
    projectId: number,
    data: {
      snapshot_ids: number[];
      new_model?: string;
      /** When overriding the replay model, align with Release Gate (OpenAI / Anthropic / Google). */
      replay_provider?: "openai" | "anthropic" | "google";
      /** Optional saved project key for BYOK when using a non-hosted model id. */
      replay_user_api_key_id?: number;
      new_system_prompt?: string;
      rubric_id?: number;
      judge_model?: string;
    }
  ) => {
    const response = await apiClient.post(`/replay/${projectId}/run`, data);
    return response.data;
  },

  listRubrics: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/rubrics`);
    return response.data;
  },

  createRubric: async (
    projectId: number,
    data: { name: string; criteria_prompt: string; description?: string }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/rubrics`, data);
    return response.data;
  },

  togglePanicMode: async (projectId: number, enabled: boolean) => {
    const response = await apiClient.post(`/projects/${projectId}/panic`, { enabled });
    return response.data;
  },

  getPanicMode: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/panic`);
    return response.data;
  },
};
