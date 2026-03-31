import { apiClient, unwrapResponse } from "./client";

export const internalBillingAPI = {
  getUserBillingTimeline: async (userId: number, limit = 20) => {
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new Error(`Invalid user id: ${userId}`);
    }
    const response = await apiClient.get(`/billing/timeline/users/${userId}`, {
      params: { limit },
    });
    return unwrapResponse(response);
  },
};
