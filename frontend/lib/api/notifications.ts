import { apiClient } from "./client";

export const notificationsAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get("/notifications", { params });
    const data = response.data;
    return Array.isArray(data) ? data : data?.data || [];
  },

  markRead: async (alertId: number) => {
    await apiClient.patch(`/notifications/${alertId}/read`);
  },

  delete: async (alertId: number) => {
    await apiClient.delete(`/notifications/${alertId}`);
  },

  getUnreadCount: async () => {
    const response = await apiClient.get("/notifications/unread-count");
    const data = response.data;
    return { count: data?.count ?? 0 };
  },
};
