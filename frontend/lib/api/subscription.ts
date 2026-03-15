import { apiClient } from "./client";

export const subscriptionAPI = {
  getCurrent: async () => {
    const response = await apiClient.get("/subscription");
    return response.data;
  },

  getPlans: async () => {
    const response = await apiClient.get("/subscription/plans");
    return response.data;
  },

  upgrade: async (planType: string) => {
    const response = await apiClient.post("/subscription/upgrade", {
      plan_type: planType,
    });
    return response.data;
  },

  cancel: async () => {
    const response = await apiClient.post("/subscription/cancel");
    return response.data;
  },
};
