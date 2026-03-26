import axios from "axios";
import { apiClient, API_URL, clearFrontendAuthSession } from "./client";

export const authAPI = {
  login: async (email: string, password: string) => {
    const body = new URLSearchParams();
    body.set("username", email);
    body.set("password", password);

    const response = await axios.post(`${API_URL}/api/v1/auth/login`, body, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      withCredentials: true,
    });
    return response.data;
  },

  register: async (
    email: string,
    password: string,
    fullName?: string,
    liabilityAgreementAccepted: boolean = false
  ) => {
    const response = await apiClient.post("/auth/register", {
      email,
      password,
      full_name: fullName,
      liability_agreement_accepted: liabilityAgreementAccepted,
    });
    return response.data;
  },

  logout: async () => {
    await axios
      .post(
        `${API_URL}/api/v1/auth/logout`,
        {},
        {
          withCredentials: true,
        }
      )
      .catch(() => undefined);
    await clearFrontendAuthSession();
  },

  getCurrentUser: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data;
  },

  getMyUsage: async (): Promise<{
    plan_type: string;
    limits: {
      snapshots_per_month?: number;
      guard_credits_per_month?: number;
      platform_replay_credits_per_month?: number;
      [k: string]: unknown;
    };
    usage_this_month: {
      snapshots: number;
      guard_credits: number;
      platform_replay_credits?: number;
      api_calls?: number;
      projects_used?: number;
      organizations_used?: number;
      api_calls_limit?: number | null;
    };
  }> => {
    const response = await apiClient.get("/auth/me/usage");
    return response.data;
  },
};
