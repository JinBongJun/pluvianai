import { apiClient, unwrapResponse } from "./client";

export const healthAPI = {
  getHealth: async () => {
    const response = await apiClient.get("/health");
    return unwrapResponse(response);
  },
};
