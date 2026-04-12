"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import {
  FormActionState,
  zodErrorToFormState,
  formSuccessResponse,
  formErrorResponse,
} from "@/lib/action-types";
import {
  getLoginErrorMessage,
  getRegisterErrorMessage,
  type AuthErrorSource,
} from "@/lib/auth-messages";
import { logger } from "@/lib/logger";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC = 60 * 30;
const DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;
const CSRF_COOKIE_NAME = "csrf_token";

function getTokenMaxAge(token: string | undefined, fallbackSeconds: number): number {
  if (!token) return fallbackSeconds;

  try {
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) return fallbackSeconds;

    const normalized = payloadBase64.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payloadJson = Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(payloadJson) as { exp?: number };
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp)) return fallbackSeconds;

    const maxAge = exp - Math.floor(Date.now() / 1000);
    return maxAge > 0 ? maxAge : fallbackSeconds;
  } catch {
    return fallbackSeconds;
  }
}

function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const csrfToken = generateCsrfToken();
  const secure = process.env.NODE_ENV === "production";
  const cookieStore = await cookies();

  cookieStore.set("access_token", accessToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    domain: AUTH_COOKIE_DOMAIN,
    maxAge: getTokenMaxAge(accessToken, DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC),
  });
  cookieStore.set("refresh_token", refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    domain: AUTH_COOKIE_DOMAIN,
    maxAge: getTokenMaxAge(refreshToken, DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC),
  });
  cookieStore.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    domain: AUTH_COOKIE_DOMAIN,
    maxAge: getTokenMaxAge(refreshToken, DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC),
  });
}

async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete({ name: "access_token", path: "/", domain: AUTH_COOKIE_DOMAIN });
  cookieStore.delete({ name: "refresh_token", path: "/", domain: AUTH_COOKIE_DOMAIN });
  cookieStore.delete({ name: CSRF_COOKIE_NAME, path: "/", domain: AUTH_COOKIE_DOMAIN });
}

// ===== Zod schemas =====

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Please enter your password"),
});

const registerSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  fullName: z.string().optional(),
  liabilityAgreementAccepted: z.boolean().refine(val => val === true, {
    message: "You must accept the clinical protocol",
  }),
});

// ===== Server Actions =====

/**
 * Login Server Action
 * Authenticates with FormData and stores tokens in httpOnly cookies.
 */
export async function loginAction(
  prevState: FormActionState<{
    access_token: string;
    refresh_token: string;
    user_info?: any;
  }> | null,
  formData: FormData
): Promise<FormActionState<{ access_token: string; refresh_token: string; user_info?: any }>> {
  // 1. Parse form data
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  // 2. Zod validation
  const parsed = loginSchema.safeParse(rawData);
  if (!parsed.success) {
    return zodErrorToFormState(parsed.error);
  }

  // 3. Call API
  try {
    const formBody = new FormData();
    formBody.append("username", parsed.data.email);
    formBody.append("password", parsed.data.password);

    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      body: formBody,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData?.detail;
      const msg = getLoginErrorMessage({ status: response.status, detail });
      return formErrorResponse(msg);
    }

    const data = await response.json();
    const { access_token, refresh_token } = data;

    // Decode JWT token and extract user info
    let userInfo = null;
    try {
      const base64Url = access_token.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split("")
          .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );

      const payload = JSON.parse(jsonPayload);

      // Extract user info from payload
      userInfo = {
        id: payload.sub,
        email: parsed.data.email, // Use email from login form input
        full_name: payload.full_name || parsed.data.email.split("@")[0], // Use token value when present, fallback to email prefix
      };
    } catch (error) {
      logger.error("Failed to decode access token after login", error);
    }

    await setAuthCookies(access_token, refresh_token);

    return formSuccessResponse({
      access_token,
      refresh_token,
      user_info: userInfo,
    });
  } catch (error: unknown) {
    logger.error("loginAction failed", error);
    const e = error as {
      response?: { status?: number; data?: { detail?: AuthErrorSource["detail"] } };
      message?: string;
    };
    const msg = getLoginErrorMessage({
      status: e.response?.status,
      detail: e.response?.data?.detail,
      message: e.message,
    });
    return formErrorResponse(msg);
  }
}

/**
 * Register Server Action
 * Automatically logs in after successful registration and stores tokens in cookies.
 */
export async function registerAction(
  prevState: FormActionState<{
    user_id: number;
    authenticated?: boolean;
  }> | null,
  formData: FormData
): Promise<
  FormActionState<{
    user_id: number;
    authenticated?: boolean;
  }>
> {
  // 1. Parse form data
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
    fullName: formData.get("fullName") || undefined,
    liabilityAgreementAccepted: formData.get("liabilityAgreementAccepted") === "true",
  };

  // 2. Zod validation
  const parsed = registerSchema.safeParse(rawData);
  if (!parsed.success) {
    return zodErrorToFormState(parsed.error);
  }

  // 3. Call registration API
  try {
    const response = await fetch(`${API_URL}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: parsed.data.email,
        password: parsed.data.password,
        full_name: parsed.data.fullName,
        liability_agreement_accepted: parsed.data.liabilityAgreementAccepted,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = getRegisterErrorMessage({ status: response.status, detail: errorData?.detail });
      return formErrorResponse(msg);
    }

    const userData = await response.json();

    // 4. Auto-login after successful registration
    const loginFormBody = new FormData();
    loginFormBody.append("username", parsed.data.email);
    loginFormBody.append("password", parsed.data.password);

    const loginResponse = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      body: loginFormBody,
    });

    if (!loginResponse.ok) {
      // Registration succeeded, so return success even if auto-login fails
      logger.error("registerAction: auto-login failed after successful registration", undefined, {
        status: loginResponse.status,
      });
      return formSuccessResponse({ user_id: userData.id });
    }

    const loginData = await loginResponse.json();
    const { access_token, refresh_token } = loginData;

    // 5. Store tokens in cookies
    await setAuthCookies(access_token, refresh_token);

    // Include tokens in return payload (for client-side localStorage usage)
    return formSuccessResponse({ user_id: userData.id, authenticated: true });
  } catch (error: unknown) {
    logger.error("registerAction failed", error);
    const e = error as {
      response?: { status?: number; data?: { detail?: AuthErrorSource["detail"] } };
      message?: string;
    };
    const msg = getRegisterErrorMessage({
      status: e.response?.status,
      detail: e.response?.data?.detail,
      message: e.message,
    });
    return formErrorResponse(msg);
  }
}

/**
 * Logout Server Action
 * Deletes cookies and redirects to the login page.
 */
export async function logoutAction(): Promise<void> {
  await clearAuthCookies();
  redirect("/login");
}

/**
 * Fetch current user info (used by Server Components)
 */
export async function getCurrentUser() {
  const token = (await cookies()).get("access_token")?.value;

  if (!token) {
    return null;
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store", // Always fetch fresh user info
    });

    if (!response.ok) {
      return null;
    }

    const user = await response.json();
    return user;
  } catch (error) {
    logger.error("getCurrentUser failed", error);
    return null;
  }
}
