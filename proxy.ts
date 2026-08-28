import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { allowedOrigins, isTrustedRequest } from "@/lib/origin";

// The API is the only surface that changes state, and none of it is authenticated.
export const config = {
  matcher: "/api/:path*",
};

export function proxy(request: NextRequest) {
  const trusted = isTrustedRequest({
    method: request.method,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    host: request.headers.get("host"),
    allowed: allowedOrigins(),
  });
  if (!trusted) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.next();
}
