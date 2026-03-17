"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  FormActionState,
  zodErrorToFormState,
  formSuccessResponse,
  formErrorResponse,
} from "@/lib/action-types";
import { getLoginErrorMessage, getRegisterErrorMessage } from "@/lib/auth-messages";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC = 60 * 30;
const DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 7;
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;

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

    console.log("🔵 [loginAction] Sending request to:", `${API_URL}/api/v1/auth/login`);
    console.log("🔵 [loginAction] Email:", parsed.data.email);

    const response = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: "POST",
      body: formBody,
    });

    console.log("🔵 [loginAction] Response status:", response.status);
    console.log("🔵 [loginAction] Response ok:", response.ok);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData?.detail;
      const msg = getLoginErrorMessage({ status: response.status, detail });
      return formErrorResponse(msg);
    }

    const data = await response.json();
    const { access_token, refresh_token } = data;

    console.log("✅ [loginAction] Login successful, setting cookies");
    console.log("🔵 [loginAction] Token preview:", access_token?.substring(0, 20) + "...");

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
      console.log("✅ [loginAction] Token decoded, user_id:", payload.sub);

      // Extract user info from payload
      userInfo = {
        id: payload.sub,
        email: parsed.data.email, // Use email from login form input
        full_name: payload.full_name || parsed.data.email.split("@")[0], // Use token value when present, fallback to email prefix
      };
      console.log("✅ [loginAction] User info extracted:", userInfo.email);
    } catch (error) {
      console.error("🔴 [loginAction] Failed to decode token:", error);
    }

    // Set cookies with standard settings
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };

    cookies().set("access_token", access_token, {
      ...cookieOptions,
      domain: AUTH_COOKIE_DOMAIN,
      maxAge: getTokenMaxAge(access_token, DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC),
    });
    cookies().set("refresh_token", refresh_token, {
      ...cookieOptions,
      domain: AUTH_COOKIE_DOMAIN,
      maxAge: getTokenMaxAge(refresh_token, DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC),
    });

    console.log("✅ [loginAction] Authentication cookies set");
    return formSuccessResponse({
      access_token,
      refresh_token,
      user_info: userInfo,
    });
  } catch (error: any) {
    console.error("🔴 [loginAction] Error:", error);
    const msg = getLoginErrorMessage({
      status: error?.response?.status,
      detail: error?.response?.data?.detail,
      message: error?.message,
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
      console.error("[registerAction] Auto-login failed");
      return formSuccessResponse({ user_id: userData.id });
    }

    const loginData = await loginResponse.json();
    const { access_token, refresh_token } = loginData;

    // 5. Store tokens in cookies
    cookies().set("access_token", access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: AUTH_COOKIE_DOMAIN,
      maxAge: getTokenMaxAge(access_token, DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC),
    });
    cookies().set("refresh_token", refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      domain: AUTH_COOKIE_DOMAIN,
      maxAge: getTokenMaxAge(refresh_token, DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC),
    });

    // Include tokens in return payload (for client-side localStorage usage)
    return formSuccessResponse({ user_id: userData.id, authenticated: true });
  } catch (error: any) {
    console.error("[registerAction] Error:", error);
    const msg = getRegisterErrorMessage({
      status: error?.response?.status,
      detail: error?.response?.data?.detail,
      message: error?.message,
    });
    return formErrorResponse(msg);
  }
}

/**
 * Logout Server Action
 * Deletes cookies and redirects to the login page.
 */
export async function logoutAction(): Promise<void> {
  cookies().delete({ name: "access_token", path: "/", domain: AUTH_COOKIE_DOMAIN });
  cookies().delete({ name: "refresh_token", path: "/", domain: AUTH_COOKIE_DOMAIN });
  redirect("/login");
}

/**
 * Fetch current user info (used by Server Components)
 */
export async function getCurrentUser() {
  const token = cookies().get("access_token")?.value;
  console.log("🔵 [getCurrentUser] Token exists:", !!token);
  console.log("🔵 [getCurrentUser] Token length:", token?.length || 0);

  if (!token) {
    console.log("🔴 [getCurrentUser] No token found in cookies");
    return null;
  }

  try {
    console.log("🔵 [getCurrentUser] Calling API:", `${API_URL}/api/v1/auth/me`);
    const response = await fetch(`${API_URL}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store", // Always fetch fresh user info
    });

    console.log("🔵 [getCurrentUser] Response status:", response.status);
    console.log("🔵 [getCurrentUser] Response ok:", response.ok);

    if (!response.ok) {
      console.log("🔴 [getCurrentUser] Response not ok, returning null");
      return null;
    }

    const user = await response.json();
    console.log("✅ [getCurrentUser] User retrieved:", user.email);
    return user;
  } catch (error) {
    console.error("🔴 [getCurrentUser] Error:", error);
    return null;
  }
}
