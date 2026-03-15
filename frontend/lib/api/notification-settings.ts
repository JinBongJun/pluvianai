import { apiClient, unwrapResponse } from "./client";

export const notificationSettingsAPI = {
  getSettings: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/notifications/settings`);
    return unwrapResponse(response);
  },

  updateSettings: async (projectId: number, settings: any) => {
    const response = await apiClient.put(
      `/projects/${projectId}/notifications/settings`,
      settings
    );
    return unwrapResponse(response);
  },

  sendTest: async (projectId: number, channel: "email" | "slack") => {
    const response = await apiClient.post(`/projects/${projectId}/notifications/test`, {
      channel,
    });
    return unwrapResponse(response);
  },
};
