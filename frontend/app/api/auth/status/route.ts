import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const hasAccessToken = request.cookies.has("access_token");

  return NextResponse.json(
    {
      // Only a valid access cookie counts as "authenticated" for UI gating.
      // A refresh cookie alone can be stale; API calls will refresh or redirect to login.
      authenticated: hasAccessToken,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}
