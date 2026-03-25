import { apiClient, unwrapResponse } from "./client";

export const onboardingAPI = {
  getQuickStart: async (projectId?: number) => {
    const params = projectId ? { project_id: projectId } : {};
    const response = await apiClient.get("/onboarding/quick-start", { params });
    return response.data;
  },

  simulateTraffic: async (projectId: number) => {
    const response = await apiClient.post("/onboarding/simulate", { project_id: projectId });
    return response.data;
  },

  getStatus: async () => {
    const response = await apiClient.get("/onboarding/status");
    return response.data;
  },

  checkFirstSnapshot: async (projectId: number) => {
    const response = await apiClient.get("/onboarding/first-snapshot-celebration", {
      params: { project_id: projectId },
    });
    return response.data;
  },

  acceptAgreement: async (agreementData: {
    liability_agreement_accepted: boolean;
    terms_of_service_accepted: boolean;
    privacy_policy_accepted: boolean;
  }) => {
    const response = await apiClient.post("/onboarding/accept-agreement", agreementData);
    return unwrapResponse(response);
  },
};
