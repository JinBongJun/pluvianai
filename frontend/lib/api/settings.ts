import { apiClient } from "./client";

export const settingsAPI = {
  getProfile: async () => {
    const response = await apiClient.get("/settings/profile");
    return response.data;
  },

  updateProfile: async (data: { full_name?: string }) => {
    const response = await apiClient.patch("/settings/profile", data);
    return response.data;
  },

  requestEmailChange: async (newEmail: string, currentPassword: string) => {
    const response = await apiClient.post("/settings/email/change-request", {
      new_email: newEmail,
      current_password: currentPassword,
    });
    return response.data;
  },

  deleteAccount: async (password: string, confirmationText: string) => {
    await apiClient.delete("/settings/profile", {
      data: { password, confirmation_text: confirmationText },
    });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await apiClient.patch("/settings/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  getAPIKeys: async () => {
    const response = await apiClient.get("/settings/api-keys");
    const data = response.data;
    return Array.isArray(data) ? data : data?.data || [];
  },

  createAPIKey: async (name: string) => {
    const response = await apiClient.post("/settings/api-keys", { name });
    return response.data;
  },

  deleteAPIKey: async (keyId: number) => {
    await apiClient.delete(`/settings/api-keys/${keyId}`);
  },

  updateAPIKey: async (keyId: number, name: string) => {
    const response = await apiClient.patch(`/settings/api-keys/${keyId}`, { name });
    return response.data;
  },
};
