import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC = 60 * 30;
const DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC = 60 * 60 * 24 * 7;

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

function applyAuthCookies(
  response: NextResponse,
  tokens: { access_token?: string; refresh_token?: string }
): void {
  const secure = process.env.NODE_ENV === "production";

  if (tokens.access_token) {
    response.cookies.set("access_token", tokens.access_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: getTokenMaxAge(tokens.access_token, DEFAULT_ACCESS_TOKEN_MAX_AGE_SEC),
    });
  }

  if (tokens.refresh_token) {
    response.cookies.set("refresh_token", tokens.refresh_token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: getTokenMaxAge(tokens.refresh_token, DEFAULT_REFRESH_TOKEN_MAX_AGE_SEC),
    });
  }
}

function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete("access_token");
  response.cookies.delete("refresh_token");
  response.cookies.delete("user_info");
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
  };

  const response = NextResponse.json({ ok: true });
  applyAuthCookies(response, body);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
