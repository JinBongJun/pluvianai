import { apiClient, unwrapResponse } from "./client";

export const selfHostedAPI = {
  getStatus: async () => {
    const response = await apiClient.get("/self-hosted/status");
    return unwrapResponse(response);
  },

  verifyLicense: async (licenseKey: string) => {
    const response = await apiClient.post("/self-hosted/license", { license_key: licenseKey });
    return unwrapResponse(response);
  },
};
