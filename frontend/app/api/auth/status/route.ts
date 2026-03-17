import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const hasAccessToken = request.cookies.has("access_token");
  const hasRefreshToken = request.cookies.has("refresh_token");

  return NextResponse.json({
    authenticated: hasAccessToken || hasRefreshToken,
  });
}
