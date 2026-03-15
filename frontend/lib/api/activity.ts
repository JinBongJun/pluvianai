import { apiClient } from "./client";

export const activityAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get("/activity", { params });
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  },
  listWithTotal: async (params?: any) => {
    const response = await apiClient.get("/activity", { params });
    return response.data;
  },
};
