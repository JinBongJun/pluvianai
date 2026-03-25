import { apiClient, unwrapResponse } from "./client";

export const internalUsageAPI = {
  getGuardCreditsByProject: async (month: string) => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error(`Invalid month format (expected YYYY-MM): ${month}`);
    }
    const response = await apiClient.get("/internal/usage/credits/by-project", {
      params: { month },
    });
    return unwrapResponse(response);
  },
};
