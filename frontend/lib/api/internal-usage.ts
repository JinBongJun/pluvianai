import { apiClient, unwrapResponse } from "./client";

export const internalUsageAPI = {
  getReleaseGateAttemptsByProject: async (month: string) => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new Error(`Invalid month format (expected YYYY-MM): ${month}`);
    }
    const response = await apiClient.get("/internal/usage/attempts/by-project", {
      params: { month },
    });
    return unwrapResponse(response);
  },
};
