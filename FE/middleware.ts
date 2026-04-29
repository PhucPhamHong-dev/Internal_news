import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_KEY = "internal_threads_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_KEY)?.value);

  if (pathname === "/login") {
    if (hasSession) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login"]
};
