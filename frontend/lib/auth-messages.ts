/**
 * User-friendly auth error messages (login / register).
 * Maps backend status codes and details to clear, consistent messages.
 */

export type AuthErrorSource = {
  status?: number;
  detail?: string | { message?: string; reasons?: string[] };
  message?: string;
};

const LOGIN_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check your email and password.",
  401: "Incorrect email or password. Please try again or sign up.",
  403: "This account has been deactivated. Contact support if you need access.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again in a few minutes.",
};

const REGISTER_MESSAGES: Record<number, string> = {
  400: "Please check your information and try again.",
  401: "Session expired. Please sign in again.",
  403: "You don’t have permission to do this.",
  429: "Too many attempts. Please wait a moment and try again.",
  500: "Something went wrong on our side. Please try again in a few minutes.",
};

function parseDetail(detail: AuthErrorSource["detail"]): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (typeof detail === "object" && detail !== null) {
    const msg = (detail as { message?: string }).message;
    const reasons = (detail as { reasons?: string[] }).reasons;
    if (msg && reasons?.length) return `${msg} ${reasons.join(". ")}`;
    if (msg) return msg;
  }
  return null;
}

/**
 * Returns a user-friendly message for login errors (client-side or Server Action).
 */
export function getLoginErrorMessage(source: AuthErrorSource): string {
  const status = source.status ?? (source as any)?.response?.status;
  const detail = source.detail ?? (source as any)?.response?.data?.detail;
  const parsed = parseDetail(detail);

  if (status === 401 && parsed?.toLowerCase().includes("incorrect")) {
    return "Incorrect email or password. Please try again or sign up.";
  }
  if (status === 429) {
    const waitMatch = typeof parsed === "string" && parsed.match(/(\d+)\s*seconds?/);
    if (waitMatch) {
      return `Too many attempts. Please try again in ${waitMatch[1]} seconds.`;
    }
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (status === 403 && parsed?.toLowerCase().includes("inactive")) {
    return "This account has been deactivated. Contact support if you need access.";
  }
  if (parsed && parsed.length > 0 && parsed.length < 200) {
    return parsed;
  }
  if (status && LOGIN_MESSAGES[status]) {
    return LOGIN_MESSAGES[status];
  }
  if (source.message?.includes("Network") || source.message?.includes("timeout")) {
    return "We couldn't connect. Check your connection and try again.";
  }
  return "Login failed. Please check your credentials and try again.";
}

/**
 * Returns a user-friendly message for register errors.
 */
export function getRegisterErrorMessage(source: AuthErrorSource): string {
  const status = source.status ?? (source as any)?.response?.status;
  const detail = source.detail ?? (source as any)?.response?.data?.detail;
  const parsed = parseDetail(detail);

  if (status === 400) {
    if (typeof detail === "object" && detail !== null && "reasons" in detail) {
      const reasons = (detail as { reasons?: string[] }).reasons;
      if (reasons?.length) {
        return `Password doesn't meet requirements: ${reasons.join(". ")}`;
      }
      return "Password doesn't meet security requirements. Use at least 8 characters.";
    }
    if (
      parsed?.toLowerCase().includes("already exists") ||
      parsed?.toLowerCase().includes("already registered")
    ) {
      return "An account with this email already exists. Try signing in.";
    }
    if (parsed?.toLowerCase().includes("liability") || parsed?.toLowerCase().includes("accept")) {
      return "You must accept the terms to continue.";
    }
    if (parsed && parsed.length > 0 && parsed.length < 200) return parsed;
  }

  if (status && REGISTER_MESSAGES[status]) {
    return REGISTER_MESSAGES[status];
  }
  if (source.message?.includes("Network") || source.message?.includes("timeout")) {
    return "We couldn't connect. Check your connection and try again.";
  }
  return "Registration failed. Please check your information and try again.";
}

/**
 * Get auth error message for either login or register from an axios-style error.
 */
export function getAuthErrorMessage(err: any, kind: "login" | "register" = "login"): string {
  const status = err?.response?.status;
  const detail = err?.response?.data?.detail ?? err?.message;
  const source: AuthErrorSource = { status, detail, message: err?.message };
  return kind === "login" ? getLoginErrorMessage(source) : getRegisterErrorMessage(source);
}
