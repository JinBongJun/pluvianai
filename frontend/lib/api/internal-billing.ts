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

  reconcileUserBilling: async (userId: number) => {
    if (!Number.isFinite(userId) || userId <= 0) {
      throw new Error(`Invalid user id: ${userId}`);
    }
    const response = await apiClient.post(`/billing/reconcile/users/${userId}`, {});
    return unwrapResponse(response);
  },

  retryWebhookEvent: async (eventId: string) => {
    const normalized = String(eventId || "").trim();
    if (!normalized) {
      throw new Error("Missing webhook event id");
    }
    const response = await apiClient.post(`/billing/webhook/retry/${encodeURIComponent(normalized)}`, {});
    return unwrapResponse(response);
  },
};
