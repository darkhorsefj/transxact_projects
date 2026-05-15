import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/constants";

const authRoutes = ["/auth", "/auth/register"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthRoute =
    authRoutes.includes(pathname) || pathname.startsWith("/auth/");
  const hasAuthToken = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);

  if (!hasAuthToken && !isAuthRoute) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*$).*)"],
};
