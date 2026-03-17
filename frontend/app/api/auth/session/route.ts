import { NextResponse } from "next/server";
const AUTH_COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN || undefined;

function clearAuthCookies(response: NextResponse): void {
  response.cookies.delete({ name: "access_token", path: "/", domain: AUTH_COOKIE_DOMAIN });
  response.cookies.delete({ name: "refresh_token", path: "/", domain: AUTH_COOKIE_DOMAIN });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearAuthCookies(response);
  return response;
}
