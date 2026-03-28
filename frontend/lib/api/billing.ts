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

  /**
   * Switch Starter ↔ Pro on the existing Paddle subscription (prorated upgrade; downgrade from next renewal).
   * Free accounts should use {@link createCheckoutSession} instead.
   */
  changePlan: async (planType: string) => {
    const response = await apiClient.post(
      "/billing/change-plan",
      { plan_type: planType },
      { timeout: 90_000 }
    );
    return unwrapResponse(response);
  },

  /** Paddle-hosted customer portal (cancel subscription, payment method, invoices). */
  createCustomerPortalSession: async () => {
    const response = await apiClient.post("/billing/customer-portal", {});
    return unwrapResponse(response);
  },
};
