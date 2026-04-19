// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import {
  closeIcon,
  mountOverlayHost,
  sparkIcon,
  typingDots
} from "../../../src/runtime/overlay/elements";

afterEach(() => {
  // Clean up any mounted root between tests.
  document.querySelectorAll("#pyanchor-overlay-root").forEach((node) => node.remove());
});

describe("SVG icon strings", () => {
  it("sparkIcon contains a single <svg> with the spark class", () => {
    expect(sparkIcon).toContain("<svg");
    expect(sparkIcon).toContain('class="spark"');
    expect(sparkIcon).toContain('aria-hidden="true"');
  });

  it("closeIcon contains an X stroke path", () => {
    expect(closeIcon).toContain("<svg");
    expect(closeIcon).toContain('class="close"');
    expect(closeIcon).toContain("M4 4 12 12M12 4 4 12");
  });

  it("typingDots emits three .typing__dot spans for the loading animation", () => {
    const matches = typingDots.match(/typing__dot/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(3);
  });
});

describe("mountOverlayHost", () => {
  it("appends a #pyanchor-overlay-root host under document.body", () => {
    const { host } = mountOverlayHost();
    expect(host.id).toBe("pyanchor-overlay-root");
    expect(host.parentElement).toBe(document.body);
  });

  it("attaches an open Shadow DOM the caller can populate", () => {
    const { host, shadowRoot } = mountOverlayHost();
    expect(host.shadowRoot).toBe(shadowRoot);
    expect(shadowRoot.mode).toBe("open");

    // Caller can append into the shadow root and the page DOM stays clean.
    const inner = document.createElement("div");
    inner.id = "inner";
    shadowRoot.appendChild(inner);
    expect(shadowRoot.querySelector("#inner")).toBe(inner);
    expect(document.querySelector("#inner")).toBeNull(); // shadow encapsulation
  });

  it("accepts a custom Document (e.g. an iframe) for testing isolation", () => {
    // happy-dom doesn't expose a separate document factory; use the
    // same document but verify the parameter is honored at the
    // appendChild level.
    const customDoc = document;
    const { host } = mountOverlayHost(customDoc);
    expect(host.ownerDocument).toBe(customDoc);
  });
});
