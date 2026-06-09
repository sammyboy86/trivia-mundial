import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/constants";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /admin/dashboard routes
  if (pathname.startsWith("/admin/dashboard")) {
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      const loginUrl = new URL("/admin", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Token format validation (basic check — full verification in API routes)
    try {
      const decoded = Buffer.from(sessionToken, "base64").toString("utf-8");
      const parts = decoded.split(":");
      if (parts.length !== 3) {
        const loginUrl = new URL("/admin", request.url);
        return NextResponse.redirect(loginUrl);
      }
      const expiry = parseInt(parts[1], 10);
      if (Date.now() > expiry) {
        const response = NextResponse.redirect(new URL("/admin", request.url));
        response.cookies.delete(SESSION_COOKIE_NAME);
        return response;
      }
    } catch {
      const loginUrl = new URL("/admin", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/dashboard/:path*"],
};
