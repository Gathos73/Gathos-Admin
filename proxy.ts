import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-gathos-admin-path",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/",
    "/gpus/:path*",
    "/products/:path*",
    "/product-routes/:path*",
    "/plans/:path*",
    "/plan-limits/:path*",
    "/users/:path*",
    "/api-keys/:path*",
    "/security-blocklist/:path*",
    "/meta-deletion-requests/:path*",
    "/newsletter-subscribers/:path*",
    "/affiliates/:path*",
    "/generations/:path*",
    "/priority-support/:path*",
  ],
};
