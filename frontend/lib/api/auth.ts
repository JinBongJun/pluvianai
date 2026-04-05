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

  verifyEmail: async (token: string) => {
    const response = await apiClient.get("/auth/verify-email", { params: { token } });
    return response.data;
  },

  resendVerification: async (email: string) => {
    const response = await apiClient.post("/auth/verify-email/resend", { email });
    return response.data;
  },

  getGoogleOAuthStartUrl: (
    intent: "login" | "signup" = "login",
    options?: { next?: string; termsAccepted?: boolean }
  ) => {
    const params = new URLSearchParams();
    params.set("intent", intent);
    if (options?.next) params.set("next", options.next);
    if (options?.termsAccepted) params.set("terms_accepted", "true");
    return `${API_URL}/api/v1/auth/oauth/google/start?${params.toString()}`;
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
    display_plan_type?: string;
    subscription_status?: string;
    entitlement_status?: string;
    current_period_start?: string | null;
    current_period_end?: string | null;
    next_reset_at?: string | null;
    usage_window_type?: string | null;
    usage_anchor_source?: string | null;
    entitlement_effective_from?: string | null;
    entitlement_effective_to?: string | null;
    limits: {
      snapshots_per_month?: number;
      release_gate_attempts_per_month?: number;
      guard_credits_per_month?: number;
      platform_replay_credits_per_month?: number;
      [k: string]: unknown;
    };
    usage_current_period?: {
      snapshots: number;
      release_gate_attempts?: number;
      guard_credits: number;
      platform_replay_credits?: number;
      api_calls?: number;
      projects_used?: number;
      organizations_used?: number;
      api_calls_limit?: number | null;
    };
    usage_this_month: {
      snapshots: number;
      release_gate_attempts?: number;
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

  getDefaultWorkspace: async (): Promise<{
    path: string;
    organization_id: number | null;
    project_id: number | null;
  }> => {
    const response = await apiClient.get("/auth/me/default-workspace");
    return response.data;
  },
};
