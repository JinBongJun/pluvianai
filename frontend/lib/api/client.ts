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
const SESSION_AUTH_CODES = new Set([
  "no_token",
  "access_token_expired",
  "access_token_invalid",
  "refresh_token_missing",
  "refresh_token_expired",
  "refresh_token_invalid",
  "refresh_token_not_found",
  "refresh_token_revoked",
]);

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

type ApiErrorPayload = {
  status: number;
  code: string | null;
  message: string | null;
  details: Record<string, unknown> | null;
};

export type RateLimitInfo = {
  bucket: string | null;
  limit: number | null;
  windowSec: number | null;
  retryAfterSec: number | null;
};

function getSafeNextPath(): string | null {
  if (typeof window === "undefined") return null;
  const next = `${window.location.pathname}${window.location.search}`;
  return next.startsWith("/") ? next : null;
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user_info");
}

export function extractApiErrorPayload(error: any): ApiErrorPayload {
  const status = Number(error?.response?.status ?? 0);
  const responseData = error?.response?.data;
  const topLevelError =
    responseData?.error && typeof responseData.error === "object" ? responseData.error : null;
  const detail =
    responseData?.detail && typeof responseData.detail === "object" ? responseData.detail : null;

  const code =
    (typeof topLevelError?.code === "string" && topLevelError.code) ||
    (typeof detail?.code === "string" && detail.code) ||
    null;
  const message =
    (typeof topLevelError?.message === "string" && topLevelError.message) ||
    (typeof detail?.message === "string" && detail.message) ||
    (typeof responseData?.message === "string" && responseData.message) ||
    (typeof responseData?.detail === "string" && responseData.detail) ||
    null;
  const details =
    (topLevelError?.details &&
    typeof topLevelError.details === "object" &&
    !Array.isArray(topLevelError.details)
      ? topLevelError.details
      : detail) || null;

  return { status, code, message, details };
}

export function getApiErrorCode(error: any): string | null {
  return extractApiErrorPayload(error).code;
}

export function getApiErrorMessage(error: any): string | null {
  return extractApiErrorPayload(error).message;
}

export function isRateLimitError(error: any): boolean {
  return Number(error?.response?.status ?? 0) === 429;
}

export function getRateLimitInfo(error: any): RateLimitInfo {
  const { details } = extractApiErrorPayload(error);
  const asNumber = (value: unknown): number | null => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };
  return {
    bucket: typeof details?.bucket === "string" ? details.bucket : null,
    limit: asNumber(details?.limit),
    windowSec: asNumber(details?.window_sec),
    retryAfterSec:
      asNumber(details?.retry_after_sec) ??
      asNumber(error?.response?.headers?.["retry-after"]),
  };
}

export function isSessionAuthError(errorOrCode: any): boolean {
  const code =
    typeof errorOrCode === "string" ? errorOrCode : extractApiErrorPayload(errorOrCode).code;
  return !!code && SESSION_AUTH_CODES.has(code);
}

export function redirectToLogin(options?: { code?: string | null; message?: string | null }): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  params.set("reauth", "1");
  const code = options?.code?.trim();
  if (code) params.set("code", code);
  const next = getSafeNextPath();
  if (next) params.set("next", next);
  if (options?.message) {
    sessionStorage.setItem("pluvianai_reauth_message", options.message);
  } else {
    sessionStorage.removeItem("pluvianai_reauth_message");
  }
  window.location.href = `/login?${params.toString()}`;
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
    redirectToLogin({
      code: "no_token",
      message: "You need to sign in to access this page.",
    });
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
      const { code, message } = extractApiErrorPayload(error);
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[API] 401 on",
          originalRequest.url,
          "– backend says:",
          JSON.stringify({ code, message })
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
          const refreshPayload = extractApiErrorPayload(refreshError);
          clearStoredAuth();
          redirectToLogin({
            code: refreshPayload.code || code,
            message:
              refreshPayload.message ||
              message ||
              "Your session has expired. Please sign in again.",
          });
          return Promise.reject(refreshError);
        }
      }
      if (typeof window !== "undefined") {
        clearStoredAuth();
        redirectToLogin({
          code,
          message: message || "Your session has expired. Please sign in again.",
        });
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
