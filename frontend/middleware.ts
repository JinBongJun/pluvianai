import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Block dev-only routes in production. Layout notFound() runs during `next build`
 * (NODE_ENV=production) and breaks static generation; middleware only runs at request time.
 */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const path = request.nextUrl.pathname;
  const isInternal = path === "/internal" || path.startsWith("/internal/");
  const isTest = path === "/test" || path.startsWith("/test/");
  if (isInternal || isTest) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/internal", "/internal/:path*", "/test", "/test/:path*"],
};
