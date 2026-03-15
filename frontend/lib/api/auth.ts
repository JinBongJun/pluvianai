import axios from "axios";
import { apiClient, API_URL } from "./client";

export const authAPI = {
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

  login: async (email: string, password: string) => {
    const formData = new FormData();
    formData.append("username", email);
    formData.append("password", password);

    const response = await axios.post(`${API_URL}/api/v1/auth/login`, formData, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const data = response.data?.data ?? response.data;
    const access_token = data?.access_token ?? response.data?.access_token;
    const refresh_token = data?.refresh_token ?? response.data?.refresh_token;
    if (!access_token) throw new Error("Login response missing access_token");

    localStorage.setItem("access_token", access_token);
    if (refresh_token) localStorage.setItem("refresh_token", refresh_token);

    let userInfo: { id?: string; email?: string; full_name?: string } | null = null;
    try {
      const payload = JSON.parse(
        atob(access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
      );
      userInfo = {
        id: payload.sub,
        email: payload.email ?? email,
        full_name: payload.full_name ?? "",
      };
      localStorage.setItem("user_info", JSON.stringify(userInfo));
    } catch {
      localStorage.setItem("user_info", JSON.stringify({ email, full_name: "" }));
    }

    return { access_token, refresh_token, user_info: userInfo };
  },

  logout: () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
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
    };
  }> => {
    const response = await apiClient.get("/auth/me/usage");
    return response.data;
  },
};
