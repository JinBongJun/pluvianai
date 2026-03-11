/**
 * API client for PluvianAI backend
 */
import axios from "axios";
import { toNumber } from "@/lib/format";
import { validateArrayResponse } from "@/lib/validate";

// Helper to log API client errors consistently
const logError = (message: string, error?: unknown, context?: Record<string, unknown>) => {
  console.error(message, error, context);
};

const logWarn = (message: string, context?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === "development") {
    console.warn(message, context);
  }
};

/**
 * Unwrap API response data - handles both {data: T} wrapper and direct T response
 * This standardizes the pattern: response.data?.data || response.data
 */
const unwrapResponse = (response: { data: any }): any => {
  const data = response.data;
  if (data && typeof data === "object" && "data" in data) {
    return data.data;
  }
  return data;
};

/**
 * Unwrap API response and ensure array - returns empty array if not an array
 */
const unwrapArrayResponse = (response: { data: any }): any[] => {
  const data = unwrapResponse(response);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "items" in data) {
    return data.items || [];
  }
  return [];
};
import {
  CostAnalysisSchema,
  QualityScoreSchema,
  DriftDetectionSchema,
  ProjectSchema,
  APICallSchema,
  AlertSchema,
  OrganizationSchema,
  OrganizationArraySchema,
  OrganizationProjectStatsSchema,
  OrganizationProjectArraySchema,
} from "@/lib/schemas";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const API_TIMEOUT_MS = 30_000; // 30s – avoid indefinite hang on slow networks

const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: API_TIMEOUT_MS,
  headers: {
    "Content-Type": "application/json",
  },
});

// Paths that do not require authentication (endpoint path without /api/v1)
const PUBLIC_PATHS = [
  /^\/auth\/login/,
  /^\/auth\/register/,
  /^\/auth\/forgot/,
  /^\/health/,
  /^\/trust-center\/policies/,
  /^\/trust-center\/compliance/,
];
function isPublicPath(url: string): boolean {
  if (!url) return false;
  let path = url.split("?")[0] || "";
  if (path.startsWith("http")) {
    try {
      path = new URL(url).pathname;
    } catch {
      path = url.split("?")[0] || "";
    }
  }
  if (path.startsWith("/api/v1/")) path = path.slice(7);
  else if (path.startsWith("/api/v1")) path = "/";
  if (!path.startsWith("/")) path = "/" + path;
  return PUBLIC_PATHS.some(re => re.test(path));
}

// Add auth token to requests; redirect to login if no token on protected paths (avoids 401)
apiClient.interceptors.request.use(
  config => {
    if (typeof window === "undefined") return config;
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      if (process.env.NODE_ENV === "development") {
        const url = (config.baseURL || "") + (config.url || "");
        console.debug("[API] Request with token:", url?.replace(/^.*\/api\/v1/, ""));
      }
      return config;
    }
    if (isPublicPath(config.url || "")) return config;
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[API] No token in localStorage for protected request – redirecting to login. URL:",
        config.url
      );
    }
    window.location.href = "/login?reauth=1";
    return Promise.reject(new Error("Not authenticated"));
  },
  err => Promise.reject(err)
);

// Handle token refresh on 401 and upgrade required errors
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error?.config as any | undefined;

    // Handle Upgrade Required (403 with X-Upgrade-Required header)
    if (
      error.response?.status === 403 &&
      error.response?.headers["x-upgrade-required"] === "true"
    ) {
      // Store upgrade info in error for component handling
      error.upgradeRequired = true;
      error.upgradeDetails = error.response?.data?.error?.details || {};
      // Don't throw here - let components handle it with QuotaExceededState
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      if (process.env.NODE_ENV === "development") {
        const detail = error.response?.data?.detail ?? error.response?.data?.message ?? "unknown";
        console.warn(
          "[API] 401 on",
          originalRequest.url,
          "– backend says:",
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
      }

      // Never touch browser-only APIs when an API helper is used from server context.
      if (typeof window === "undefined") {
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const response = await axios.post(
            `${API_URL}/api/v1/auth/refresh`,
            {
              refresh_token: refreshToken,
            },
            { headers: { "Content-Type": "application/json" } }
          );
          const data = response.data?.data ?? response.data;
          const access_token = data?.access_token;
          const refresh_token_new = data?.refresh_token;
          if (!access_token) {
            throw new Error("Refresh response missing access_token");
          }
          localStorage.setItem("access_token", access_token);
          if (refresh_token_new) localStorage.setItem("refresh_token", refresh_token_new);
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return apiClient(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          window.location.href = "/login?reauth=1";
          return Promise.reject(refreshError);
        }
      }
      // No refresh token: redirect to login
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login?reauth=1";
      }
    }

    // Handle upgrade required errors (403 with X-Upgrade-Required header)
    if (
      error.response?.status === 403 &&
      error.response?.headers?.["x-upgrade-required"] === "true"
    ) {
      // Store upgrade info in error for component handling
      const errorData = error.response?.data;
      if (errorData?.error?.details) {
        error.upgradeInfo = errorData.error.details;
      }
    }

    // 404 "Not Found" (route missing): log URL to help debug wrong API path or base URL
    if (error.response?.status === 404) {
      const msg = error.response?.data?.error?.message;
      if (msg === "Not Found" && process.env.NODE_ENV === "development") {
        logWarn("[API] 404 Not Found – check route and NEXT_PUBLIC_API_URL", {
          url: originalRequest?.url,
          baseURL: originalRequest?.baseURL,
        });
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
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

  /** Current user's plan, limits, and usage this month (for free-tier visibility). */
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

// Organizations API
const normalizePlan = (plan?: string): PlanType => {
  const normalized = (plan || "free").toLowerCase();
  // Map legacy plan ids into our 3 official plans
  if (normalized === "free") return "free";
  if (normalized === "indie" || normalized === "startup" || normalized === "pro") return "pro";
  if (normalized === "enterprise") return "enterprise";
  return "free";
};

const normalizeOrganization = (org: any): OrganizationSummary => {
  const stats = org?.stats || {};
  return {
    id: org?.id,
    name: org?.name || "Untitled organization",
    plan: normalizePlan(org?.plan_type || org?.plan),
    projects: stats.projects ?? org?.projects_count ?? org?.projects ?? 0,
    calls7d: stats.calls_7d ?? org?.calls_7d,
    cost7d: stats.cost_7d ?? org?.cost_7d,
    alertsOpen: stats.alerts_open ?? org?.alerts ?? org?.alerts_open,
    driftDetected: stats.drift_detected ?? org?.drift_detected ?? false,
  };
};

const normalizeOrganizationDetail = (org: any): OrganizationDetail => {
  const base = normalizeOrganization(org);
  const usage = org?.stats?.usage || org?.usage || {};
  return {
    ...base,
    usage: {
      calls: usage.calls ?? usage.calls_7d ?? 0,
      callsLimit: usage.calls_limit ?? usage.callsLimit ?? 0,
      cost: usage.cost ?? usage.cost_7d ?? 0,
      costLimit: usage.cost_limit ?? usage.costLimit ?? 0,
      quality: usage.quality ?? 0,
    },
    alerts: org?.stats?.alerts || org?.alerts || [],
  };
};

const normalizeOrganizationProject = (project: any): OrganizationProject => ({
  id: project?.id,
  name: project?.name || "Untitled project",
  description: project?.description || null,
  calls24h: project?.calls_24h ?? project?.calls24h ?? 0,
  cost7d: project?.cost_7d ?? project?.cost7d ?? 0,
  quality: project?.quality ?? project?.quality_score ?? null,
  alerts: project?.alerts_open ?? project?.alerts ?? 0,
  drift: project?.drift_detected ?? project?.drift ?? false,
});

export const organizationsAPI = {
  create: async (data: { name: string; description?: string | null; plan_type?: PlanType }) => {
    const response = await apiClient.post("/organizations", {
      name: data.name,
      description: data.description ?? null,
      plan_type: data.plan_type ?? "free",
    });
    try {
      const parsed = OrganizationSchema.parse(response.data);
      return normalizeOrganizationDetail(parsed);
    } catch (error) {
      logWarn("[API Validation] Organization create schema mismatch", { error });
      return normalizeOrganizationDetail(response.data);
    }
  },

  list: async (options?: { includeStats?: boolean; search?: string }) => {
    const response = await apiClient.get("/organizations", {
      params: {
        include_stats: options?.includeStats,
        search: options?.search,
      },
    });
    const validated = validateArrayResponse(OrganizationSchema, response.data, "/organizations");
    return validated.map(normalizeOrganization);
  },

  get: async (id: number | string, options?: { includeStats?: boolean }) => {
    const response = await apiClient.get(`/organizations/${id}`, {
      params: { include_stats: options?.includeStats },
    });
    const data = unwrapResponse(response) ?? response.data;
    if (data == null || (typeof data === "object" && !("id" in data))) {
      throw new Error("Organization data is missing");
    }
    try {
      const parsed = OrganizationSchema.parse(data);
      return normalizeOrganizationDetail(parsed);
    } catch (error) {
      logWarn("[API Validation] Organization schema mismatch", { error });
      return normalizeOrganizationDetail(data);
    }
  },

  listProjects: async (
    id: number | string,
    options?: { includeStats?: boolean; search?: string }
  ) => {
    const response = await apiClient.get(`/organizations/${id}/projects`, {
      params: {
        include_stats: options?.includeStats,
        search: options?.search,
      },
    });
    const data = unwrapResponse(response) ?? response.data;
    const validated = validateArrayResponse(
      OrganizationProjectStatsSchema,
      Array.isArray(data) ? data : (data?.items ?? data?.data ?? []),
      `/organizations/${id}/projects`
    );
    return validated.map(normalizeOrganizationProject);
  },

  update: async (id: number | string, data: { name?: string }) => {
    const response = await apiClient.patch(`/organizations/${id}`, data);
    return response.data;
  },

  delete: async (id: number | string) => {
    await apiClient.delete(`/organizations/${id}`);
  },

  listMembers: async (id: number | string) => {
    const response = await apiClient.get(`/organizations/${id}/members`);
    return response.data;
  },

  inviteMember: async (id: number | string, data: { email: string; role: string }) => {
    const response = await apiClient.post(`/organizations/${id}/members`, data);
    return response.data;
  },

  removeMember: async (orgId: number | string, memberId: number) => {
    await apiClient.delete(`/organizations/${orgId}/members/${memberId}`);
  },
};

// Projects API
export const projectsAPI = {
  list: async (search?: string) => {
    const params = search ? { search } : {};
    const response = await apiClient.get("/projects", { params });
    // Validate array response
    return validateArrayResponse(ProjectSchema, response.data, "/projects");
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/projects/${id}`);
    // Validate single item response
    try {
      return ProjectSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] Project ${id} schema mismatch`, { error });
      return response.data; // Return raw data on validation failure
    }
  },

  getDataRetentionSummary: async (
    projectId: number
  ): Promise<{
    plan_type: string;
    retention_days: number;
    total_snapshots: number;
    expiring_soon: number;
    cutoff_date: string;
  }> => {
    const response = await apiClient.get(`/projects/${projectId}/data-retention-summary`);
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    generate_sample_data?: boolean;
    organization_id?: number;
    usage_mode?: "full" | "test_only";
  }) => {
    const response = await apiClient.post("/projects", {
      name: data.name,
      description: data.description,
      generate_sample_data: data.generate_sample_data,
      organization_id: data.organization_id,
      usage_mode: data.usage_mode ?? "full",
    });
    return response.data;
  },

  update: async (
    id: number,
    data?: { name?: string; description?: string; usage_mode?: "full" | "test_only" }
  ) => {
    const body: { name?: string; description?: string; usage_mode?: string } = {};
    if (data?.name !== undefined) body.name = data.name;
    if (data?.description !== undefined) body.description = data.description;
    if (data?.usage_mode !== undefined) body.usage_mode = data.usage_mode;
    const response = await apiClient.patch(`/projects/${id}`, body);
    return response.data;
  },

  delete: async (id: number) => {
    await apiClient.delete(`/projects/${id}`);
  },

  updateDiagnosticConfig: async (projectId: number, config: any) => {
    const response = await apiClient.patch(`/projects/${projectId}`, {
      diagnostic_config: config,
    });
    return unwrapResponse(response);
  },

  applyPatch: async (projectId: number, data: { nodes: any[]; edges: any[]; version?: string }) => {
    const response = await apiClient.post(`/projects/${projectId}/apply-patch`, data);
    return unwrapResponse(response);
  },
};

// Project Members API
export const projectMembersAPI = {
  list: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/members`);
    return response.data;
  },

  add: async (projectId: number, userEmail: string, role: "admin" | "member" | "viewer") => {
    const response = await apiClient.post(`/projects/${projectId}/members`, {
      user_email: userEmail,
      role,
    });
    return response.data;
  },

  updateRole: async (projectId: number, userId: number, role: "admin" | "member" | "viewer") => {
    const response = await apiClient.patch(`/projects/${projectId}/members/${userId}`, {
      role,
    });
    return response.data;
  },

  remove: async (projectId: number, userId: number) => {
    await apiClient.delete(`/projects/${projectId}/members/${userId}`);
  },
};

// API Calls API
export const apiCallsAPI = {
  list: async (projectId: number, params?: any) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Ensure limit doesn't exceed backend max (1000)
    const validatedParams = {
      ...params,
      limit: params?.limit ? Math.min(params.limit, 1000) : 100,
    };
    const response = await apiClient.get("/api-calls", {
      params: { project_id: Number(projectId), ...validatedParams },
    });
    // Validate array response - use item schema, not array schema
    return validateArrayResponse(APICallSchema, response.data, "/api-calls");
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/api-calls/by-id/${id}`);
    // Validate single item response
    try {
      return APICallSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] API call ${id} schema mismatch`, { error });
      return response.data; // Return raw data on validation failure
    }
  },

  getStats: async (projectId: number, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days
    if (days < 1 || days > 30) {
      days = 7; // Default to 7 if invalid
    }
    const response = await apiClient.get("/api-calls/stats", {
      params: { project_id: Number(projectId), days: Number(days) },
    });
    return response.data;
  },

  /** For Streaming UI: recent items + last-1m/5m counts. Poll every 2–3s. */
  streamRecent: async (projectId: number, limit: number = 25) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.get("/api-calls/stream/recent", {
      params: { project_id: Number(projectId), limit },
    });
    return response.data;
  },
};

// Internal usage API (admin / internal dashboards)
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

// Quality API
export const qualityAPI = {
  evaluate: async (projectId: number, request: any) => {
    const response = await apiClient.post("/quality/evaluate", request, {
      params: { project_id: projectId },
    });
    return response.data;
  },

  getScores: async (projectId: number, params?: any) => {
    const response = await apiClient.get("/quality/scores", {
      params: { project_id: projectId, ...params },
    });
    // Backend returns paginated_response format: {data: [...], meta: {...}}
    // Extract data array from response
    const data = response.data?.data || response.data || [];
    // Validate array response - use item schema, not array schema
    return validateArrayResponse(QualityScoreSchema, data, "/quality/scores");
  },

  getStats: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get("/quality/stats", {
      params: { project_id: projectId, days },
    });
    return response.data;
  },
};

// Drift API
export const driftAPI = {
  detect: async (projectId: number, request: any) => {
    const response = await apiClient.post("/drift/detect", request, {
      params: { project_id: projectId },
    });
    return response.data;
  },

  list: async (projectId: number, params?: any) => {
    const response = await apiClient.get("/drift", {
      params: { project_id: projectId, ...params },
    });
    // Validate array response - use item schema, not array schema
    return validateArrayResponse(DriftDetectionSchema, response.data, "/drift");
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/drift/${id}`);
    // Validate single item response
    try {
      return DriftDetectionSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] Drift detection ${id} schema mismatch`, { error });
      return response.data; // Return raw data on validation failure
    }
  },
};

// Alerts API
export const alertsAPI = {
  list: async (projectId: number, params?: any) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Ensure limit doesn't exceed backend max (1000)
    const validatedParams = {
      ...params,
      limit: params?.limit ? Math.min(params.limit, 1000) : 100,
    };
    const response = await apiClient.get("/alerts", {
      params: { project_id: Number(projectId), ...validatedParams },
    });
    // Validate array response - return empty array on validation failure (graceful degradation)
    return validateArrayResponse(AlertSchema, response.data, "/alerts");
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/alerts/${id}`);
    // Validate single item response
    try {
      return AlertSchema.parse(response.data);
    } catch (error) {
      logWarn(`[API Validation] Alert ${id} schema mismatch`, { error });
      return response.data; // Return raw data on validation failure
    }
  },

  resolve: async (id: number) => {
    const response = await apiClient.post(`/alerts/${id}/resolve`);
    return response.data;
  },

  send: async (id: number, channels?: string[]) => {
    const response = await apiClient.post(`/alerts/${id}/send`, { channels });
    return response.data;
  },
};

// Cost API
export const costAPI = {
  getAnalysis: async (projectId: number, days: number = 7) => {
    // Validate projectId
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Validate days (backend limit is 30)
    const validatedDays = Math.min(Math.max(1, days), 30);
    const response = await apiClient.get("/cost/analysis", {
      params: { project_id: Number(projectId), days: validatedDays },
    });
    // Validate response schema - return safe defaults on failure
    try {
      return CostAnalysisSchema.parse(response.data);
    } catch (error) {
      logWarn("[API Validation] Cost analysis schema mismatch, using defaults", { error });
      return {
        total_cost: 0,
        by_model: {},
        by_provider: {},
        by_day: [],
        average_daily_cost: 0,
      };
    }
  },

  detectAnomalies: async (projectId: number) => {
    const response = await apiClient.post("/cost/detect-anomalies", null, {
      params: { project_id: projectId },
    });
    return response.data;
  },

  compareModels: async (projectId: number, days: number = 7) => {
    const response = await apiClient.get("/cost/compare-models", {
      params: { project_id: projectId, days },
    });
    return response.data;
  },

  getOptimizations: async (projectId: number, days: number = 30) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.get("/cost/optimizations", {
      params: { project_id: Number(projectId), days },
    });
    return response.data;
  },

  getPredictions: async (projectId: number, days: number = 30, predictionDays: number = 30) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.get("/cost/predictions", {
      params: { project_id: Number(projectId), days, prediction_days: predictionDays },
    });
    return response.data;
  },

  applyOptimization: async (
    projectId: number,
    optimizationId: string,
    userConfirmation: boolean = true
  ) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    const response = await apiClient.post(
      "/cost/optimizations/apply",
      {
        optimization_id: optimizationId,
        user_confirmation: userConfirmation,
      },
      {
        params: { project_id: Number(projectId) },
      }
    );
    return response.data;
  },
};

// Billing API
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
};

// Subscription API
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

// Settings API
export const settingsAPI = {
  getProfile: async () => {
    const response = await apiClient.get("/settings/profile");
    return response.data;
  },

  updateProfile: async (data: { full_name?: string }) => {
    const response = await apiClient.patch("/settings/profile", data);
    return response.data;
  },

  deleteAccount: async (password: string) => {
    await apiClient.delete("/settings/profile", {
      data: { password },
    });
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    await apiClient.patch("/settings/password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
  },

  getAPIKeys: async () => {
    const response = await apiClient.get("/settings/api-keys");
    // Ensure we always return an array
    const data = response.data;
    return Array.isArray(data) ? data : data?.data || [];
  },

  createAPIKey: async (name: string) => {
    const response = await apiClient.post("/settings/api-keys", { name });
    return response.data;
  },

  deleteAPIKey: async (keyId: number) => {
    await apiClient.delete(`/settings/api-keys/${keyId}`);
  },

  updateAPIKey: async (keyId: number, name: string) => {
    const response = await apiClient.patch(`/settings/api-keys/${keyId}`, { name });
    return response.data;
  },
};

// Test Runs API
export const testRunsAPI = {
  create: async (projectId: number, data: { nodes: any[]; edges: any[] }) => {
    if (!projectId || isNaN(projectId) || projectId <= 0) {
      throw new Error(`Invalid project ID: ${projectId}`);
    }
    // Backend expects project_id as query param and graph data as body
    const response = await apiClient.post("/test-runs/runs", data, {
      params: { project_id: Number(projectId) },
    });
    return response.data;
  },
};

// Export API
export const exportAPI = {
  exportCSV: async (projectId: number, filters?: any) => {
    const response = await apiClient.get("/export/csv", {
      params: { project_id: projectId, ...filters },
      responseType: "blob",
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `api-calls-${projectId}-${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  exportJSON: async (projectId: number, filters?: any, includeData: boolean = false) => {
    const response = await apiClient.get("/export/json", {
      params: { project_id: projectId, include_data: includeData, ...filters },
    });

    // Download as JSON file
    const dataStr = JSON.stringify(response.data, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = window.URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `api-calls-${projectId}-${new Date().toISOString().split("T")[0]}.json`
    );
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

// Activity API
export const activityAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get("/activity", { params });
    // Backend returns {items: [], total: number, limit: number, offset: number}
    // Ensure we always return an array
    const data = response.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.data)) return data.data;
    return [];
  },
  listWithTotal: async (params?: any) => {
    const response = await apiClient.get("/activity", { params });
    return response.data; // Returns {items: [], total: number, limit: number, offset: number}
  },
};

// Notifications API (in-app)
export const notificationsAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get("/notifications", { params });
    // Ensure response is an array
    const data = response.data;
    return Array.isArray(data) ? data : data?.data || [];
  },

  markRead: async (alertId: number) => {
    await apiClient.patch(`/notifications/${alertId}/read`);
  },

  delete: async (alertId: number) => {
    await apiClient.delete(`/notifications/${alertId}`);
  },

  getUnreadCount: async () => {
    const response = await apiClient.get("/notifications/unread-count");
    // Ensure response has count field
    const data = response.data;
    return { count: data?.count ?? 0 };
  },
};

// Reports API
export const reportsAPI = {
  generate: async (projectId: number, params: any) => {
    const response = await apiClient.post("/reports/generate", null, {
      params: { project_id: projectId, ...params },
    });
    return response.data;
  },

  download: async (projectId: number, params: any) => {
    try {
      const response = await apiClient.get("/reports/download", {
        params: { project_id: projectId, ...params },
        responseType: "blob",
      });

      // Check if response is an error (error responses are also blobs when responseType is 'blob')
      const contentType = response.headers["content-type"] || "";
      const format = params.format || "json";

      // For JSON format, application/json is expected, not an error
      if (format === "json" && contentType.includes("application/json") && response.status < 400) {
        // This is a valid JSON response, proceed with download
      } else if (contentType.includes("application/json") && response.status >= 400) {
        // This is an error response, parse it
        const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
        const text = await blob.text();
        try {
          const errorData = JSON.parse(text);
          const error = new Error(
            errorData.detail || errorData.message || "Failed to download report"
          );
          (error as any).response = response;
          throw error;
        } catch (parseError) {
          const error = new Error(
            "Failed to download report: " + (text || response.statusText).substring(0, 200)
          );
          (error as any).response = response;
          throw error;
        }
      }

      // Determine content type (format was already determined above)
      const fileContentType = format === "pdf" ? "application/pdf" : "application/json";

      // Create blob with correct MIME type
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([response.data], { type: fileContentType });
      const url = window.URL.createObjectURL(blob);

      try {
        const link = document.createElement("a");
        link.href = url;

        // Try to extract filename from Content-Disposition header
        let filename = `report-${projectId}-${params.template || "standard"}-${new Date().toISOString().split("T")[0]}.${format}`;
        const contentDisposition = response.headers["content-disposition"];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, "");
            // Decode URI if needed
            try {
              filename = decodeURIComponent(filename);
            } catch (e) {
              // If decoding fails, use as is
            }
          }
        }

        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        // Always revoke the object URL to free memory
        window.URL.revokeObjectURL(url);
      }
    } catch (error: any) {
      // Handle blob error responses
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        if (errorData instanceof Blob) {
          try {
            const text = await errorData.text();
            const parsedError = JSON.parse(text);
            throw new Error(
              parsedError.detail || parsedError.message || "Failed to download report"
            );
          } catch (parseError) {
            // If parsing fails, use the original error message
            if (error.message) {
              throw error;
            }
            throw new Error("Failed to download report. Please check server logs for details.");
          }
        }
      }
      throw error;
    }
  },
};

// Webhooks API
export const webhooksAPI = {
  list: async (params?: any) => {
    const response = await apiClient.get("/webhooks", { params });
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get(`/webhooks/${id}`);
    return response.data;
  },

  create: async (data: any) => {
    const response = await apiClient.post("/webhooks", data);
    return response.data;
  },

  update: async (id: number, data: any) => {
    const response = await apiClient.patch(`/webhooks/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    await apiClient.delete(`/webhooks/${id}`);
  },

  test: async (id: number) => {
    const response = await apiClient.post(`/webhooks/${id}/test`);
    return response.data;
  },
};

// Types
// Public subscription plans (MVP: all orgs effectively use the free plan)
export type PlanType = "free" | "pro" | "enterprise";

export interface OrganizationSummary {
  id: number;
  name: string;
  plan: PlanType;
  projects: number;
  calls7d?: number;
  cost7d?: number;
  alertsOpen?: number;
  driftDetected?: boolean;
}

export interface OrganizationDetail extends OrganizationSummary {
  usage: {
    calls: number;
    callsLimit: number;
    cost: number;
    costLimit: number;
    quality: number;
  };
  alerts: { project?: string; summary?: string; severity?: string }[];
}

export interface OrganizationProject {
  id: number;
  name: string;
  description: string | null;
  calls24h?: number;
  cost7d?: number;
  quality?: number | null;
  alerts?: number;
  drift?: boolean;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  owner_id: number;
  is_active: boolean;
  role?: "owner" | "admin" | "member" | "viewer"; // Added for team feature
  organization_id?: number | null; // Organization this project belongs to
}

// Replay API
export const replayAPI = {
  runBatchReplay: async (
    projectId: number,
    data: {
      snapshot_ids: number[];
      new_model?: string;
      new_system_prompt?: string;
      rubric_id?: number;
      judge_model?: string;
    }
  ) => {
    const response = await apiClient.post(`/replay/${projectId}/run`, data);
    return response.data;
  },

  listRubrics: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/rubrics`);
    return response.data;
  },

  createRubric: async (
    projectId: number,
    data: { name: string; criteria_prompt: string; description?: string }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/rubrics`, data);
    return response.data;
  },

  togglePanicMode: async (projectId: number, enabled: boolean) => {
    const response = await apiClient.post(`/projects/${projectId}/panic`, { enabled });
    return response.data;
  },

  getPanicMode: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/panic`);
    return response.data;
  },
};

// Onboarding API
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

// Model Validation API
export const modelValidationAPI = {
  validateModel: async (
    projectId: number,
    data: { new_model: string; provider: string; rubric_id?: number }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/validate-model`, data);
    return unwrapResponse(response);
  },
};

// Shared Results API
export const sharedResultsAPI = {
  shareResult: async (
    projectId: number,
    resultId: number,
    data: {
      result_type: string;
      result_data: any;
      expires_in_days?: number;
    }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/results/${resultId}/share`, data);
    return unwrapResponse(response);
  },

  share: async (
    projectId: number,
    data: {
      result_type: string;
      result_data: any;
      result_id?: number;
      expires_in_days?: number;
    }
  ) => {
    // If result_id is provided, use the existing endpoint
    if (data.result_id) {
      const response = await apiClient.post(
        `/projects/${projectId}/results/${data.result_id}/share`,
        {
          result_type: data.result_type,
          result_data: data.result_data,
          expires_in_days: data.expires_in_days,
        }
      );
      return unwrapResponse(response);
    }

    // Otherwise, create a temporary result ID (0) or use a different endpoint
    // For now, we'll use 0 as a placeholder - backend should handle this
    const response = await apiClient.post(`/projects/${projectId}/results/0/share`, {
      result_type: data.result_type,
      result_data: data.result_data,
      expires_in_days: data.expires_in_days,
    });
    return unwrapResponse(response);
  },

  getShared: async (token: string) => {
    const response = await apiClient.get(`/shared/${token}`);
    return unwrapResponse(response);
  },
};

// Judge Feedback API
export const judgeFeedbackAPI = {
  createFeedback: async (
    projectId: number,
    data: {
      evaluation_id: number;
      judge_score: number;
      human_score: number;
      comment?: string;
      correction_reason?: string;
      metadata?: any;
    }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/judge/feedback`, data);
    return unwrapResponse(response);
  },

  getFeedback: async (projectId: number, evaluationId?: number) => {
    const params: any = {};
    if (evaluationId) params.evaluation_id = evaluationId;
    const response = await apiClient.get(`/projects/${projectId}/judge/feedback`, { params });
    return unwrapResponse(response);
  },

  updateFeedback: async (
    projectId: number,
    feedbackId: number,
    data: {
      human_score?: number;
      comment?: string;
      correction_reason?: string;
      metadata?: any;
    }
  ) => {
    const response = await apiClient.put(
      `/projects/${projectId}/judge/feedback/${feedbackId}`,
      data
    );
    return unwrapResponse(response);
  },

  getReliabilityMetrics: async (projectId: number, days: number = 30) => {
    const response = await apiClient.get(`/projects/${projectId}/judge/reliability`, {
      params: { days },
    });
    return unwrapResponse(response);
  },

  runMetaValidation: async (
    projectId: number,
    evaluationId: number,
    primaryJudge: string,
    secondaryJudge: string
  ) => {
    const response = await apiClient.post(
      `/projects/${projectId}/judge/meta-validate/${evaluationId}`,
      null,
      {
        params: {
          primary_judge_model: primaryJudge,
          secondary_judge_model: secondaryJudge,
        },
      }
    );
    return unwrapResponse(response);
  },
};

// Live View API
export const liveViewAPI = {
  getAgents: async (projectId: number, limit: number = 30) => {
    const response = await apiClient.get(`/projects/${projectId}/live-view/agents`, {
      params: { limit },
    });
    return unwrapResponse(response);
  },

  getAgentSettings: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.get(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/settings`
    );
    return unwrapResponse(response);
  },

  updateAgentSettings: async (
    projectId: number,
    agentId: string,
    data: { display_name?: string; is_deleted?: boolean; diagnostic_config?: any }
  ) => {
    const safeAgentId = encodeURIComponent(agentId);
    const { diagnostic_config, ...params } = data;
    const response = await apiClient.patch(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/settings`,
      diagnostic_config,
      {
        params,
      }
    );
    return unwrapResponse(response);
  },

  deleteAgent: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    await apiClient.delete(`/projects/${projectId}/live-view/agents/${safeAgentId}`);
  },

  listSnapshots: async (
    projectId: number,
    params: {
      agent_id?: string;
      is_worst?: boolean;
      light?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/snapshots`, { params });
    return unwrapResponse(response);
  },

  getSnapshot: async (projectId: number, snapshotId: string | number) => {
    const response = await apiClient.get(
      `/projects/${projectId}/snapshots/${encodeURIComponent(String(snapshotId))}`
    );
    return unwrapResponse(response);
  },

  getAgentEvaluation: async (projectId: number, agentId: string) => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.get(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/evaluation`
    );
    return unwrapResponse(response);
  },

  listSavedLogs: async (
    projectId: number,
    agentId: string,
    params: { limit?: number; offset?: number } = {}
  ): Promise<{
    items: Array<{
      id: number;
      snapshot_id: number;
      trace_id?: string | null;
      agent_id?: string | null;
      provider?: string | null;
      model?: string | null;
      status_code?: number | null;
      latency_ms?: number | null;
      eval_checks_result?: Record<string, unknown> | null;
      snapshot_created_at?: string | null;
      saved_at?: string | null;
    }>;
    total: number;
    limit: number;
    offset: number;
  }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.get(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs`,
      { params }
    );
    return unwrapResponse(response);
  },

  saveLogs: async (
    projectId: number,
    agentId: string,
    snapshotIds: number[]
  ): Promise<{
    ok: boolean;
    saved_count: number;
    already_saved_count: number;
    missing_snapshot_ids?: number[];
    mismatched_snapshot_ids?: number[];
  }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.post(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs`,
      { snapshot_ids: snapshotIds }
    );
    return unwrapResponse(response);
  },

  deleteSavedLogs: async (
    projectId: number,
    agentId: string,
    snapshotIds: number[]
  ): Promise<{ ok: boolean; deleted: number }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.post(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs/batch-delete`,
      { snapshot_ids: snapshotIds }
    );
    return unwrapResponse(response);
  },

  clearSavedLogs: async (
    projectId: number,
    agentId: string
  ): Promise<{ ok: boolean; deleted: number }> => {
    const safeAgentId = encodeURIComponent(agentId);
    const response = await apiClient.delete(
      `/projects/${projectId}/live-view/agents/${safeAgentId}/saved-logs`
    );
    return unwrapResponse(response);
  },
};

// Self-hosted API
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

// Dashboard API
export const dashboardAPI = {
  getMetrics: async (projectId: number, period: "24h" | "7d" | "30d" = "24h") => {
    const response = await apiClient.get(`/projects/${projectId}/dashboard/metrics`, {
      params: { period },
    });
    return unwrapResponse(response);
  },

  getTrends: async (
    projectId: number,
    period: "1d" | "7d" | "30d" | "90d" = "7d",
    groupBy: "hour" | "day" | "week" = "hour"
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/dashboard/trends`, {
      params: { period, group_by: groupBy },
    });
    return unwrapResponse(response);
  },
};

// Notification Settings API
export const notificationSettingsAPI = {
  getSettings: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/notifications/settings`);
    return unwrapResponse(response);
  },

  updateSettings: async (projectId: number, settings: any) => {
    const response = await apiClient.put(`/projects/${projectId}/notifications/settings`, settings);
    return unwrapResponse(response);
  },

  sendTest: async (projectId: number, channel: "email" | "slack") => {
    const response = await apiClient.post(`/projects/${projectId}/notifications/test`, { channel });
    return unwrapResponse(response);
  },
};

// Project LLM / User API Keys (OpenAI, Anthropic, Google, Custom)
export const projectUserApiKeysAPI = {
  list: async (projectId: number) => {
    const response = await apiClient.get(`/projects/${projectId}/user-api-keys`);
    return Array.isArray(response.data) ? response.data : (response.data?.data ?? []);
  },

  create: async (
    projectId: number,
    data: { provider: string; api_key: string; name?: string; agent_id?: string }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/user-api-keys`, data);
    return response.data?.data ?? response.data;
  },

  delete: async (projectId: number, keyId: number) => {
    await apiClient.delete(`/projects/${projectId}/user-api-keys/${keyId}`);
  },
};

// Rule Market API
export const ruleMarketAPI = {
  list: async (params?: {
    category?: string;
    rule_type?: string;
    tags?: string;
    search?: string;
    sort?: "popular" | "recent" | "rating";
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get("/rule-market", { params });
    return unwrapArrayResponse(response);
  },

  getFeatured: async (limit: number = 10) => {
    const response = await apiClient.get("/rule-market/featured", { params: { limit } });
    return unwrapArrayResponse(response);
  },

  get: async (ruleId: number) => {
    const response = await apiClient.get(`/rule-market/${ruleId}`);
    return unwrapResponse(response);
  },

  create: async (rule: {
    name: string;
    description?: string;
    rule_type: "pii" | "toxicity" | "hallucination" | "custom";
    pattern: string;
    pattern_type: "regex" | "keyword" | "ml";
    category?: string;
    tags?: string[];
  }) => {
    const response = await apiClient.post("/rule-market", rule);
    return unwrapResponse(response);
  },

  download: async (ruleId: number, projectId: number) => {
    const response = await apiClient.post(`/rule-market/${ruleId}/download`, {
      project_id: projectId,
    });
    return unwrapResponse(response);
  },

  rate: async (ruleId: number, rating: number) => {
    const response = await apiClient.post(`/rule-market/${ruleId}/rate`, { rating });
    return unwrapResponse(response);
  },
};

// Admin API
export const adminAPI = {
  generateSampleData: async (projectId: number) => {
    const response = await apiClient.post("/admin/generate-sample-data", null, {
      params: { project_id: projectId },
    });
    return unwrapResponse(response);
  },

  getCurrentUser: async () => {
    const response = await apiClient.get("/auth/me");
    return unwrapResponse(response);
  },

  getStats: async () => {
    const response = await apiClient.get("/admin/stats");
    return unwrapResponse(response);
  },

  listUsers: async (params?: { limit?: number; offset?: number; search?: string }) => {
    const response = await apiClient.get("/admin/users", { params });
    return unwrapResponse(response);
  },

  startImpersonation: async (
    userId: number,
    data: { reason?: string; duration_minutes?: number }
  ) => {
    const response = await apiClient.post(`/admin/users/${userId}/impersonate`, data);
    return unwrapResponse(response);
  },

  endImpersonation: async (sessionId: string) => {
    const response = await apiClient.delete(`/admin/impersonate/${sessionId}`);
    return unwrapResponse(response);
  },
};

// Health API
export const healthAPI = {
  getHealth: async () => {
    const response = await apiClient.get("/health");
    return unwrapResponse(response);
  },
};

// Public Benchmarks API
export const publicBenchmarksAPI = {
  list: async (params?: {
    category?: string;
    benchmark_type?: string;
    tags?: string;
    search?: string;
    sort?: "recent" | "popular" | "featured";
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get("/public/benchmarks", { params });
    return unwrapArrayResponse(response);
  },

  getFeatured: async (limit: number = 10) => {
    const response = await apiClient.get("/public/benchmarks/featured", { params: { limit } });
    return unwrapArrayResponse(response);
  },

  get: async (benchmarkId: number) => {
    const response = await apiClient.get(`/public/benchmarks/${benchmarkId}`);
    return unwrapResponse(response);
  },

  publish: async (benchmark: {
    name: string;
    description?: string;
    benchmark_type: "model_comparison" | "task_performance";
    benchmark_data: any;
    test_cases_count: number;
    category?: string;
    tags?: string[];
  }) => {
    const response = await apiClient.post("/benchmarks/publish", benchmark);
    return unwrapResponse(response);
  },
};

export default apiClient;

// Behavior Rule API
export interface RuleJSON {
  type: "tool_forbidden" | "tool_allowlist" | "tool_order" | "tool_args_schema";
  name?: string;
  severity?: "low" | "medium" | "high" | "critical";
  spec: any; // Defined in detail in contract, using any for flexibility here
  meta?: any;
}

export interface BehaviorRule {
  id: string;
  project_id: number;
  name: string;
  description?: string | null;
  scope_type: "project" | "agent" | "canvas";
  scope_ref?: string | null;
  severity_default?: "low" | "medium" | "high" | "critical" | null;
  rule_json: RuleJSON;
  enabled: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ValidationReport {
  report_id: string;
  status: "pass" | "fail";
  summary: any;
  violations: any[];
}

export interface CompareResult {
  baseline_run_id: string;
  candidate_run_id: string;
  baseline_summary: any;
  candidate_summary: any;
  violation_count_delta: number;
  severity_delta: any;
  top_regressed_rules: any[];
  first_broken_step: number | null;
  is_regressed: boolean;
}

export interface CIGateResult {
  pass: boolean;
  exit_code: 0 | 1;
  report_id: string;
  report_url: string;
  summary: any;
  violations: any[];
  failure_reasons: string[];
  thresholds_used: Record<string, number>;
  compare_mode: boolean;
}

/** Human-readable behavior change band (by tool_divergence_pct: 0–5% stable, 5–20% minor, >20% major). */
export type BehaviorChangeBand = "stable" | "minor" | "major";

/** Behavior diff: baseline vs run tool sequence/set comparison (for Release Gate). */
export interface BehaviorDiffResult {
  sequence_distance: number;
  tool_divergence: number;
  tool_divergence_pct: number;
  /** Human-readable: stable / minor / major. */
  change_band?: BehaviorChangeBand;
  baseline_sequence: string[];
  candidate_sequence: string[];
}

export interface ReleaseGateAttempt {
  run_index: number;
  pass: boolean;
  trace_id?: string;
  failure_reasons?: string[];
  replay?: {
    attempted: number;
    succeeded: number;
    failed: number;
    avg_latency_ms?: number | null;
    failed_snapshot_ids: Array<string | number>;
    error_messages?: string[];
    error_codes?: string[];
    missing_provider_keys?: string[];
  };
  /** Baseline vs this run: tool sequence distance and set divergence. */
  behavior_diff?: BehaviorDiffResult;
}

export interface ReleaseGateRunSummary {
  eval_mode?: "replay_test";
  case_status?: "pass" | "fail" | "flaky";
  pass_ratio?: number;
  is_flaky?: boolean;
  is_consistently_failing?: boolean;
  latency_min_ms?: number | null;
  latency_max_ms?: number | null;
  [key: string]: unknown;
}

export interface ReleaseGateViolation {
  rule_id?: string;
  rule_name?: string;
  message?: string;
  step_ref?: string | number | null;
  severity?: "critical" | "high" | "medium" | "low" | string;
  evidence?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReleaseGateRunResult {
  run_index: number;
  pass: boolean;
  case_status?: "pass" | "fail" | "flaky";
  failure_reasons: string[];
  violation_count_delta: number;
  severity_delta: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  replay: {
    attempted: number;
    succeeded: number;
    failed: number;
    avg_latency_ms?: number | null;
    failed_snapshot_ids: Array<string | number>;
    error_messages?: string[];
    error_codes?: string[];
    missing_provider_keys?: string[];
  };
  summary: ReleaseGateRunSummary;
  violations: ReleaseGateViolation[];
  top_regressed_rules: any[];
  first_broken_step: number | null;
  attempts?: ReleaseGateAttempt[];
  eval_elements_passed?: { rule_id: string; rule_name: string }[];
  eval_elements_failed?: { rule_id: string; rule_name: string; violation_count: number }[];
  trace_id?: string;
}

export interface ReleaseGateResult {
  pass: boolean;
  summary?: string;
  failed_signals?: string[];
  exit_code: 0 | 1;
  report_id: string;
  trace_id: string;
  baseline_trace_id: string;
  failure_reasons: string[];
  thresholds_used: Record<string, number>;
  fail_rate?: number;
  flaky_rate?: number;
  failed_inputs?: number;
  flaky_inputs?: number;
  total_inputs?: number;
  repeat_runs: number;
  replay_error_codes?: string[];
  missing_provider_keys?: string[];
  run_results?: ReleaseGateRunResult[];
  case_results?: ReleaseGateRunResult[];
  evidence_pack: {
    top_regressed_rules: any[];
    first_violations: ReleaseGateViolation[];
    failed_replay_snapshot_ids: Array<string | number>;
    sample_failure_reasons: string[];
  };
}

export interface ReleaseGateHistoryItem {
  id: string;
  status: "pass" | "fail";
  trace_id: string;
  baseline_trace_id?: string | null;
  agent_id?: string | null;
  created_at?: string | null;
  mode?: "replay_test";
  repeat_runs?: number | null;
  passed_runs?: number | null;
  failed_runs?: number | null;
  thresholds?: Record<string, number> | null;
}

export interface ReleaseGateHistoryResponse {
  items: ReleaseGateHistoryItem[];
  total: number;
  limit: number;
  offset: number;
}

export const behaviorAPI = {
  listRules: async (
    projectId: number,
    params?: { enabled?: boolean; scope_type?: "project" | "agent" | "canvas"; scope_ref?: string }
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/behavior/rules`, { params });
    return unwrapArrayResponse(response) as BehaviorRule[];
  },

  createRule: async (
    projectId: number,
    data: Omit<BehaviorRule, "id" | "created_at" | "updated_at" | "project_id">
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/rules`, data);
    return response.data;
  },

  updateRule: async (
    projectId: number,
    ruleId: string,
    data: Partial<Omit<BehaviorRule, "id" | "created_at" | "updated_at" | "project_id">>
  ) => {
    const response = await apiClient.put(
      `/projects/${projectId}/behavior/rules/${encodeURIComponent(ruleId)}`,
      data
    );
    return response.data;
  },

  deleteRule: async (projectId: number, ruleId: string) => {
    await apiClient.delete(`/projects/${projectId}/behavior/rules/${encodeURIComponent(ruleId)}`);
  },

  listReports: async (
    projectId: number,
    params?: {
      agent_id?: string;
      status?: "pass" | "fail";
      limit?: number;
      offset?: number;
    }
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/behavior/reports`, { params });
    return response.data;
  },

  exportReport: async (projectId: number, reportId: string, format: "json" | "csv" = "json") => {
    if (format === "csv") {
      const response = await apiClient.get(
        `/projects/${projectId}/behavior/reports/${reportId}/export`,
        { params: { format: "csv" }, responseType: "blob" }
      );
      return response.data;
    }
    const response = await apiClient.get(
      `/projects/${projectId}/behavior/reports/${reportId}/export`,
      { params: { format: "json" } }
    );
    return response.data;
  },

  validate: async (
    projectId: number,
    data: {
      trace_id?: string;
      test_run_id?: string;
      rule_ids?: string[];
      baseline_run_ref?: string;
    }
  ): Promise<ValidationReport> => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/validate`, data);
    return response.data;
  },

  compare: async (
    projectId: number,
    data: {
      baseline_test_run_id: string;
      candidate_test_run_id: string;
      rule_ids?: string[];
    }
  ): Promise<CompareResult> => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/compare`, data);
    return response.data;
  },

  ciGate: async (
    projectId: number,
    data: {
      baseline_test_run_id?: string;
      candidate_test_run_id: string;
      rule_ids?: string[];
      thresholds?: {
        critical?: number;
        high?: number;
        medium?: number;
        low?: number;
        critical_delta?: number;
        high_delta?: number;
        medium_delta?: number;
        low_delta?: number;
      };
    }
  ): Promise<CIGateResult> => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/ci-gate`, data);
    return response.data;
  },

  createDataset: async (
    projectId: number,
    data: {
      trace_ids?: string[];
      snapshot_ids?: number[];
      agent_id?: string;
      label?: string;
      tag?: string;
      eval_config_snapshot?: Record<string, unknown>;
      policy_ruleset_snapshot?: Array<{
        id: string;
        revision?: string;
        rule_json: Record<string, unknown>;
      }>;
      ruleset_hash?: string;
    }
  ) => {
    const response = await apiClient.post(`/projects/${projectId}/behavior/datasets`, data);
    return response.data;
  },

  /** Create multiple datasets in one request (faster than N createDataset calls). */
  createDatasetsBatch: async (
    projectId: number,
    payload: {
      items: Array<{
        snapshot_ids?: number[];
        agent_id?: string;
        label?: string;
        eval_config_snapshot?: Record<string, unknown>;
        policy_ruleset_snapshot?: Array<{
          id: string;
          revision?: string;
          rule_json: Record<string, unknown>;
        }>;
      }>;
    }
  ): Promise<{
    created: Array<Record<string, unknown>>;
    errors?: Array<{ index: number; message: string }>;
  }> => {
    const response = await apiClient.post(
      `/projects/${projectId}/behavior/datasets/batch`,
      payload
    );
    return response.data;
  },

  listDatasets: async (
    projectId: number,
    params?: { agent_id?: string; limit?: number; offset?: number; summary?: boolean }
  ) => {
    const response = await apiClient.get(`/projects/${projectId}/behavior/datasets`, {
      params: { summary: true, ...params },
    });
    return response.data;
  },

  getDataset: async (projectId: number, datasetId: string) => {
    const response = await apiClient.get(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}`
    );
    return response.data;
  },

  getDatasetSnapshots: async (
    projectId: number,
    datasetId: string
  ): Promise<{ items: any[]; total: number }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}/snapshots`
    );
    const data = response.data;
    if (data && typeof data === "object" && "items" in data) return data;
    return { items: [], total: 0 };
  },

  updateDataset: async (
    projectId: number,
    datasetId: string,
    body: { snapshot_ids?: number[]; label?: string }
  ): Promise<{ id: string; snapshot_ids: number[]; label?: string | null }> => {
    const response = await apiClient.patch(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}`,
      body
    );
    return response.data;
  },

  deleteDataset: async (projectId: number, datasetId: string) => {
    await apiClient.post(
      `/projects/${projectId}/behavior/datasets/${encodeURIComponent(datasetId)}/delete`
    );
  },

  /** Delete multiple datasets in one request (faster than N single deletes). */
  deleteDatasetsBatch: async (projectId: number, datasetIds: string[]) => {
    if (datasetIds.length === 0) return;
    const response = await apiClient.post<{ ok: boolean; deleted: number }>(
      `/projects/${projectId}/behavior/datasets/batch-delete`,
      { dataset_ids: datasetIds }
    );
    return response.data;
  },
};

type ReleaseGateValidatePayload = {
  agent_id?: string;
  use_recent_snapshots?: boolean;
  recent_snapshot_limit?: number;
  trace_id?: string;
  dataset_id?: string;
  dataset_ids?: string[];
  snapshot_ids?: string[];
  baseline_trace_id?: string;
  model_source?: "detected" | "platform";
  new_model?: string;
  replay_provider?: "openai" | "anthropic" | "google";
  replay_api_key?: string;
  new_system_prompt?: string;
  replay_temperature?: number;
  replay_max_tokens?: number;
  replay_top_p?: number;
  replay_overrides?: Record<string, unknown>;
  rule_ids?: string[];
  max_snapshots?: number;
  repeat_runs?: number;
  evaluation_mode?: "replay_test";
  fail_rate_max?: number;
  flaky_rate_max?: number;
};

export const releaseGateAPI = {
  getAgents: async (
    projectId: number,
    limit: number = 50
  ): Promise<{ items: { agent_id: string; display_name: string }[] }> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/agents`, {
      params: { limit },
    });
    return response.data;
  },

  getRecentSnapshots: async (
    projectId: number,
    agentId: string,
    limit: number = 20
  ): Promise<{
    items: { id: string; trace_id: string; created_at: string }[];
    total: number;
    total_available?: number;
  }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/release-gate/agents/${encodeURIComponent(agentId)}/recent-snapshots`,
      { params: { limit } }
    );
    return response.data;
  },

  getRecommendedSnapshots: async (
    projectId: number,
    agentId: string
  ): Promise<{
    snapshot_ids: string[];
    worst_snapshot_ids?: number[];
    golden_snapshot_ids?: number[];
    fill_snapshot_ids?: number[];
    worst_items?: { id: number; trace_id?: string | null; created_at?: string | null }[];
    golden_items?: { id: number; trace_id?: string | null; created_at?: string | null }[];
    fill_items?: { id: number; trace_id?: string | null; created_at?: string | null }[];
    meta: { worst: number; golden: number; window_days: number };
    label?: string;
  }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/release-gate/agents/${encodeURIComponent(agentId)}/recommended-snapshots`
    );
    const data = response.data;
    const raw = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const rawIds = Array.isArray(raw.snapshot_ids) ? raw.snapshot_ids : [];
    const meta =
      raw.meta && typeof raw.meta === "object"
        ? (raw.meta as { worst: number; golden: number; window_days: number })
        : { worst: 0, golden: 0, window_days: 7 };

    const toNumIds = (arr: unknown): number[] =>
      Array.isArray(arr)
        ? arr.map(x => (typeof x === "number" ? x : Number(x))).filter(Number.isFinite)
        : [];
    const toItems = (
      arr: unknown
    ): { id: number; trace_id?: string | null; created_at?: string | null }[] =>
      Array.isArray(arr)
        ? arr.map(item => {
            const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const id = typeof o.id === "number" ? o.id : Number(o.id);
            return {
              id: Number.isFinite(id) ? id : 0,
              trace_id:
                typeof o.trace_id === "string"
                  ? o.trace_id
                  : o.trace_id == null
                    ? null
                    : String(o.trace_id),
              created_at:
                typeof o.created_at === "string"
                  ? o.created_at
                  : o.created_at == null
                    ? null
                    : String(o.created_at),
            };
          })
        : [];

    return {
      snapshot_ids: rawIds.map(x => String(x)),
      worst_snapshot_ids: toNumIds(raw.worst_snapshot_ids),
      golden_snapshot_ids: toNumIds(raw.golden_snapshot_ids),
      fill_snapshot_ids: toNumIds(raw.fill_snapshot_ids),
      worst_items: toItems(raw.worst_items),
      golden_items: toItems(raw.golden_items),
      fill_items: toItems(raw.fill_items),
      meta,
      label: typeof raw.label === "string" ? raw.label : undefined,
    };
  },

  validate: async (
    projectId: number,
    data: ReleaseGateValidatePayload
  ): Promise<ReleaseGateResult> => {
    const response = await apiClient.post(`/projects/${projectId}/release-gate/validate`, data);
    return response.data;
  },

  validateAsync: async (
    projectId: number,
    data: ReleaseGateValidatePayload
  ): Promise<{
    job: {
      id: string;
      status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      created_at?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      cancel_requested_at?: string | null;
      progress: { done: number; total?: number | null; phase?: string | null };
      report_id?: string | null;
      error_detail?: Record<string, unknown> | null;
    };
  }> => {
    const response = await apiClient.post(
      `/projects/${projectId}/release-gate/validate-async`,
      data
    );
    return response.data;
  },

  getJob: async (
    projectId: number,
    jobId: string,
    includeResult: 0 | 1 = 0
  ): Promise<{
    job: {
      id: string;
      status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      created_at?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      cancel_requested_at?: string | null;
      progress: { done: number; total?: number | null; phase?: string | null };
      report_id?: string | null;
      error_detail?: Record<string, unknown> | null;
    };
    result?: ReleaseGateResult | null;
  }> => {
    const response = await apiClient.get(
      `/projects/${projectId}/release-gate/jobs/${encodeURIComponent(jobId)}`,
      { params: { include_result: includeResult }, timeout: 10000 }
    );
    return response.data;
  },

  cancelJob: async (
    projectId: number,
    jobId: string
  ): Promise<{
    job: {
      id: string;
      status: "queued" | "running" | "succeeded" | "failed" | "canceled";
      created_at?: string | null;
      started_at?: string | null;
      finished_at?: string | null;
      cancel_requested_at?: string | null;
      progress: { done: number; total?: number | null; phase?: string | null };
      report_id?: string | null;
      error_detail?: Record<string, unknown> | null;
    };
  }> => {
    const response = await apiClient.post(
      `/projects/${projectId}/release-gate/jobs/${encodeURIComponent(jobId)}/cancel`
    );
    return response.data;
  },

  suggestBaseline: async (
    projectId: number,
    params: { trace_id: string; agent_id?: string }
  ): Promise<{
    baseline_trace_id: string | null;
    source?: string | null;
    report_id?: string | null;
    agent_id?: string | null;
    created_at?: string | null;
  }> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/suggest-baseline`, {
      params,
    });
    return response.data;
  },

  listHistory: async (
    projectId: number,
    params?: { status?: "pass" | "fail"; trace_id?: string; limit?: number; offset?: number }
  ): Promise<ReleaseGateHistoryResponse> => {
    const response = await apiClient.get(`/projects/${projectId}/release-gate/history`, { params });
    return response.data;
  },
};
