import { NextResponse, type NextRequest } from "next/server";

/**
 * Production gate for pyanchor in a publicly-deployed app.
 *
 * The pattern: visit `/?_pyanchor=<your-secret>` once → middleware
 * verifies the secret matches `PYANCHOR_GATE_SECRET` env → sets a
 * 30-day HttpOnly cookie → redirects to the same path without the
 * query param → all subsequent requests in this browser carry the
 * cookie → the layout conditionally renders the bootstrap script
 * AND the sidecar's `requireGateCookie` middleware admits the
 * resulting `/_pyanchor/*` calls.
 *
 * Logout: visit `/?_pyanchor=logout` (or any value other than the
 * secret) and we clear the cookie.
 *
 * Anonymous traffic: never gets the cookie, never sees bootstrap,
 * never reaches the sidecar.
 */

const COOKIE_NAME = "pyanchor_dev";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export function middleware(request: NextRequest) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("_pyanchor");

  if (requested === null) {
    // Normal page load — no gate action requested. Pass through.
    return NextResponse.next();
  }

  // Strip the query so the URL bar stops carrying the secret.
  url.searchParams.delete("_pyanchor");

  if (requested === "logout") {
    const response = NextResponse.redirect(url);
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  const secret = process.env.PYANCHOR_GATE_SECRET ?? "";
  if (!secret || requested !== secret) {
    // Wrong secret OR the env wasn't set on this deployment. Don't
    // hint at success; just redirect with no cookie change.
    return NextResponse.redirect(url);
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S
  });
  return response;
}

export const config = {
  // Run on every request so we can intercept `?_pyanchor=...` on any
  // route. Skip Next.js internals + static assets to keep the
  // middleware cheap.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
