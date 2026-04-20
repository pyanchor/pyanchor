/**
 * One-shot endpoint that issues the pyanchor_dev cookie based on
 * NextAuth session + allowlist. Hit GET /api/pyanchor-gate after
 * signing in; you'll get redirected to / with the cookie set.
 *
 * The cookie is HttpOnly + SameSite=Strict, so client JS can't
 * steal it; only requests from the same origin carry it.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions, isPyanchorAllowed } from "../../../lib/auth";

const COOKIE_NAME = "pyanchor_dev";
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/**
 * Clamp the `from` query param to a same-origin relative path so an
 * attacker can't turn this endpoint into an open redirect. Anything
 * that doesn't start with a single `/` (e.g. `https://attacker.example`,
 * `//attacker.example`, protocol-relative URLs) collapses to `/`.
 */
const safeRedirectPath = (value: string | null): string => {
  if (!value) return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const url = new URL(request.url);
  const redirectTo = safeRedirectPath(url.searchParams.get("from"));

  if (!session?.user?.email || !isPyanchorAllowed(session.user.email)) {
    // Not signed in OR not allowlisted — silently redirect (don't
    // leak the existence of the gate to anonymous traffic).
    return NextResponse.redirect(new URL(redirectTo, url));
  }

  const response = NextResponse.redirect(new URL(redirectTo, url));
  response.cookies.set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_S
  });
  return response;
}

// Logout: clear the pyanchor cookie. NextAuth signOut handles its
// own session separately.
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
