import { NextResponse } from "next/server";
import { createGatewaySession, GATEWAY_SESSION_COOKIE, GATEWAY_SESSION_MAX_AGE, matchesGatewayToken } from "@/lib/gateway-auth";

function isSecureRequest(request: Request): boolean {
  return request.url.startsWith("https:") || request.headers.get("x-forwarded-proto") === "https";
}

export async function POST(request: Request) {
  let token: unknown;
  try {
    ({ token } = await request.json() as { token?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (typeof token !== "string" || token.length > 128 || !matchesGatewayToken(token)) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(GATEWAY_SESSION_COOKIE, createGatewaySession(), {
    httpOnly: true,
    maxAge: GATEWAY_SESSION_MAX_AGE,
    path: "/",
    sameSite: "strict",
    secure: isSecureRequest(request),
  });
  return response;
}
