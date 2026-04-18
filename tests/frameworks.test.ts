import { describe, expect, it, vi } from "vitest";

import {
  FRAMEWORK_NAMES,
  nextjsProfile,
  selectFramework,
  viteProfile
} from "../src/frameworks";

describe("selectFramework", () => {
  it("returns the nextjs profile by default", () => {
    expect(selectFramework("nextjs")).toBe(nextjsProfile);
  });

  it("returns the vite profile when asked", () => {
    expect(selectFramework("vite")).toBe(viteProfile);
  });

  it("matches case-insensitively", () => {
    expect(selectFramework("VITE")).toBe(viteProfile);
    expect(selectFramework("NextJS")).toBe(nextjsProfile);
  });

  it("falls back to nextjs for unknown values, with a console warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const profile = selectFramework("astro");
      expect(profile).toBe(nextjsProfile);
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0]?.[0]).toContain("Unknown PYANCHOR_FRAMEWORK");
    } finally {
      warn.mockRestore();
    }
  });

  it("does NOT warn for the empty string (treated as default)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(selectFramework("")).toBe(nextjsProfile);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("exposes the registered framework names", () => {
    expect(FRAMEWORK_NAMES).toEqual(expect.arrayContaining(["nextjs", "vite"]));
  });
});

describe("nextjsProfile", () => {
  it("uses corepack yarn install as the default install command", () => {
    expect(nextjsProfile.installCommand).toContain("yarn install");
    expect(nextjsProfile.installCommand).toContain("--frozen-lockfile");
  });

  it("uses next build as the default build command with telemetry off", () => {
    expect(nextjsProfile.buildCommand).toContain("next build");
    expect(nextjsProfile.buildCommand).toContain("NEXT_TELEMETRY_DISABLED");
  });

  it("excludes the .next cache from rsync", () => {
    expect(nextjsProfile.workspaceExcludes).toContain(".next");
  });

  it("returns auth-specific route hints for /login and /signup", () => {
    expect(nextjsProfile.routeHints("/login").join("\n")).toContain("auth");
    expect(nextjsProfile.routeHints("/signup").join("\n")).toContain("auth");
  });

  it("returns generic two-line guidance for arbitrary routes", () => {
    const hints = nextjsProfile.routeHints("/dashboard");
    expect(hints).toHaveLength(2);
    expect(hints[0]).toContain("target route file");
  });

  it("emits app/ and pages/ candidates for a named route", () => {
    const candidates = nextjsProfile.routeFileCandidates("/login");
    expect(candidates).toContain("app/login/page.tsx");
    expect(candidates).toContain("app/(auth)/login/page.tsx");
    expect(candidates).toContain("pages/login.tsx");
  });

  it("emits root candidates for the empty/root route", () => {
    expect(nextjsProfile.routeFileCandidates("/")).toContain("app/page.tsx");
    expect(nextjsProfile.routeFileCandidates("")).toContain("pages/index.tsx");
  });

  it("mentions next build in the brief build hint", () => {
    expect(nextjsProfile.briefBuildHint).toContain("next build");
  });
});

describe("viteProfile", () => {
  it("uses npm install as the default install command", () => {
    expect(viteProfile.installCommand).toBe("npm install");
  });

  it("uses npm run build as the default build command", () => {
    expect(viteProfile.buildCommand).toBe("npm run build");
  });

  it("excludes vite cache and dist dirs from rsync", () => {
    expect(viteProfile.workspaceExcludes).toEqual(expect.arrayContaining(["dist", ".vite"]));
  });

  it("returns root candidates pointing at src/App / src/main", () => {
    const root = viteProfile.routeFileCandidates("/");
    expect(root).toContain("src/App.tsx");
    expect(root).toContain("src/main.tsx");
  });

  it("emits routes/ + pages/ + Pascal-cased component candidates for a route", () => {
    const candidates = viteProfile.routeFileCandidates("/user-profile");
    expect(candidates).toContain("src/routes/user-profile.tsx");
    expect(candidates).toContain("src/pages/user-profile.tsx");
    expect(candidates).toContain("src/pages/UserProfile.tsx");
    expect(candidates).toContain("src/components/UserProfile.tsx");
  });

  it("mentions npm run build / vite build in the brief hint", () => {
    expect(viteProfile.briefBuildHint).toMatch(/vite build|npm run build/);
  });

  it("warns the agent that vite has no file-system router by default", () => {
    const hints = viteProfile.routeHints("/dashboard").join("\n");
    expect(hints).toMatch(/no file-system router|router config/i);
  });
});
