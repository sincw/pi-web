import { NextResponse, type NextRequest } from "next/server";
import { GATEWAY_SESSION_COOKIE, getGatewayToken, isGatewaySessionValid } from "@/lib/gateway-auth";

const LOGIN_PATH = "/login";
const LOGIN_API_PATH = "/api/gateway/login";

export function proxy(request: NextRequest) {
  getGatewayToken();

  const { pathname, search } = request.nextUrl;
  const authenticated = isGatewaySessionValid(request.cookies.get(GATEWAY_SESSION_COOKIE)?.value);
  if (pathname === LOGIN_PATH) {
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }
  if (pathname === LOGIN_API_PATH || authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
