import { apiClient, unwrapResponse } from "./client";

export const billingAPI = {
  getUsage: async () => {
    const response = await apiClient.get("/billing/usage");
    return unwrapResponse(response);
  },

  getLimits: async () => {
    const response = await apiClient.get("/billing/limits");
    return unwrapResponse(response);
  },

  createCheckoutSession: async (planType: string, successUrl: string, cancelUrl: string) => {
    const response = await apiClient.post("/billing/checkout", {
      plan_type: planType,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    return unwrapResponse(response);
  },
};
