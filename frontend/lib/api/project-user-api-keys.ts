import { apiClient } from "./client";

export const projectUserApiKeysAPI = {
  list: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/user-api-keys`);
    return Array.isArray(response.data) ? response.data : (response.data?.data ?? []);
  },

  create: async (
    projectId: number,
    data: { provider: string; api_key: string; name?: string; agent_id?: string }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/user-api-keys`, data);
    return response.data?.data ?? response.data;
  },

  delete: async (projectId: number, keyId: number) => {
    await apiClient.delete(`/projects/${projectId}/user-api-keys/${keyId}`);
  },
};
