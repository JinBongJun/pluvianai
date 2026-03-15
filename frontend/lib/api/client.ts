/**
 * Shared API client and helpers for PluvianAI backend.
 */
import axios from "axios";

export const logError = (
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
) => {
  console.error(message, error, context);
};

export const logWarn = (message: string, context?: Record<string, unknown>) => {
  if (process.env.NODE_ENV === "development") {
    console.warn(message, context);
  }
};

export const unwrapResponse = (response: { data: any }): any => {
  const data = response.data;
  if (data && typeof data === "object" && "data" in data) {
    return data.data;
  }
  return data;
};

export const unwrapArrayResponse = (response: { data: any }): any[] => {
  const data = unwrapResponse(response);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "items" in data) {
    return data.items || [];
  }
  return [];
};

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_TIMEOUT_MS = 30_000;

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

export const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: API_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" },
});

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

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error?.config as any | undefined;

    if (
      error.response?.status === 403 &&
      error.response?.headers["x-upgrade-required"] === "true"
    ) {
      error.upgradeRequired = true;
      error.upgradeDetails = error.response?.data?.error?.details || {};
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      if (process.env.NODE_ENV === "development") {
        const detail =
          error.response?.data?.detail ?? error.response?.data?.message ?? "unknown";
        console.warn(
          "[API] 401 on",
          originalRequest.url,
          "– backend says:",
          typeof detail === "string" ? detail : JSON.stringify(detail)
        );
      }

      if (typeof window === "undefined") {
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem("refresh_token");
      if (refreshToken) {
        try {
          const response = await axios.post(
            `${API_URL}/api/v1/auth/refresh`,
            { refresh_token: refreshToken },
            { headers: { "Content-Type": "application/json" } }
          );
          const data = response.data?.data ?? response.data;
          const access_token = data?.access_token;
          const refresh_token_new = data?.refresh_token;
          if (!access_token) throw new Error("Refresh response missing access_token");
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
      if (typeof window !== "undefined") {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        window.location.href = "/login?reauth=1";
      }
    }

    if (
      error.response?.status === 403 &&
      error.response?.headers?.["x-upgrade-required"] === "true"
    ) {
      const errorData = error.response?.data;
      if (errorData?.error?.details) {
        error.upgradeInfo = errorData.error.details;
      }
    }

    if (error.response?.status === 404 && process.env.NODE_ENV === "development") {
      const msg = error.response?.data?.error?.message;
      if (msg === "Not Found") {
        logWarn("[API] 404 Not Found – check route and NEXT_PUBLIC_API_URL", {
          url: originalRequest?.url,
          baseURL: originalRequest?.baseURL,
        });
      }
    }

    return Promise.reject(error);
  }
);
