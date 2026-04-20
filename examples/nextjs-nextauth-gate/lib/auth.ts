/**
 * NextAuth config sketch (v4 — adapt to v5 / Auth.js if you're on
 * the newer release).
 *
 * The point of this example: pyanchor's gate cookie is not the
 * primary auth — your existing session is. We:
 *   1. Rely on NextAuth to issue + validate user sessions.
 *   2. In layout.tsx, read the session and check `email` against an
 *      allowlist (PYANCHOR_DEV_EMAILS).
 *   3. If allowed, AND set the pyanchor_dev cookie via a server
 *      action so the sidecar's PYANCHOR_REQUIRE_GATE_COOKIE check
 *      passes for that user only.
 *
 * The cookie set step happens in /api/pyanchor-gate so the
 * pyanchor_dev cookie ride lives entirely in your existing
 * authenticated request flow — no magic-word URL needed.
 */

import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? ""
    })
  ],
  callbacks: {
    // Only let allowlisted users sign in at all.
    async signIn({ user }) {
      const allowlist = (process.env.PYANCHOR_DEV_EMAILS ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      return allowlist.length === 0 || (user.email !== null && allowlist.includes(user.email!));
    }
  }
};

export const isPyanchorAllowed = (email: string | null | undefined): boolean => {
  if (!email) return false;
  const allowlist = (process.env.PYANCHOR_DEV_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  return allowlist.includes(email);
};
