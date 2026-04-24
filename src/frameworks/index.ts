import { astroProfile } from "./astro";
import { nextjsProfile } from "./nextjs";
import { nuxtProfile } from "./nuxt";
import { remixProfile } from "./remix";
import { sveltekitProfile } from "./sveltekit";
import { viteProfile } from "./vite";

import type { FrameworkProfile } from "./types";

const profiles: Record<string, FrameworkProfile> = {
  nextjs: nextjsProfile,
  vite: viteProfile,
  astro: astroProfile,
  sveltekit: sveltekitProfile,
  remix: remixProfile,
  nuxt: nuxtProfile
};

export const FRAMEWORK_NAMES = Object.keys(profiles);

/**
 * Resolve a framework name (case-insensitive) to a profile. Falls back
 * to nextjs with a one-line warning so unknown values never crash the
 * worker — unrecognised frameworks just lose framework-specific hints
 * but still run if the user supplies PYANCHOR_INSTALL_COMMAND and
 * PYANCHOR_BUILD_COMMAND directly.
 */
export function selectFramework(name: string): FrameworkProfile {
  const key = name.trim().toLowerCase();
  const profile = profiles[key];
  if (!profile) {
    if (key && key !== "nextjs") {
      console.warn(
        `[pyanchor] Unknown PYANCHOR_FRAMEWORK="${name}". ` +
          `Falling back to "nextjs". Built-in: ${FRAMEWORK_NAMES.join(", ")}.`
      );
    }
    return nextjsProfile;
  }
  return profile;
}

export type { FrameworkProfile };
export { nextjsProfile, viteProfile, astroProfile, sveltekitProfile, remixProfile, nuxtProfile };
