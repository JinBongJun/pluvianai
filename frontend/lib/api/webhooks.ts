import { apiClient } from "./client";

export const webhooksAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get("/webhooks", { params });
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/webhooks/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await apiClient.post("/webhooks", data);
    return response.data;
  },

  update: async (id: number, data: any) => {
    const response = await apiClient.patch(`/webhooks/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    await apiClient.delete(`/webhooks/${id}`);
  },

  test: async (id: number) => {
    const response = await apiClient.post(`/webhooks/${id}/test`);
    return response.data;
  },
};
