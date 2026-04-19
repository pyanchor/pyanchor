/**
 * Inline SVG icon strings + small DOM-construction helpers used by
 * the overlay templates. No state, no event handlers — just markup
 * fragments and shadow-root setup.
 */

export const sparkIcon = `
  <svg class="spark" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 2 11.8 7.8H17.8L12.9 11.4 14.7 17.2 10 13.6 5.3 17.2 7.1 11.4 2.2 7.8H8.2L10 2Z" fill="currentColor" />
  </svg>
`;

export const closeIcon = `
  <svg class="close" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 4 12 12M12 4 4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
`;

export const typingDots = `
  <span class="typing" aria-hidden="true">
    <span class="typing__dot"></span>
    <span class="typing__dot"></span>
    <span class="typing__dot"></span>
  </span>
`;

/**
 * Mount the overlay's host element under the document body and open
 * an isolated Shadow DOM. Returns both halves so the caller can wire
 * styles into the shadow root and the host into the page DOM.
 *
 * Idempotent at the call site: caller checks
 * `window.__PyanchorOverlayLoaded` before calling.
 */
export interface OverlayMount {
  host: HTMLElement;
  shadowRoot: ShadowRoot;
}

export function mountOverlayHost(doc: Document = document): OverlayMount {
  const host = doc.createElement("div");
  host.id = "pyanchor-overlay-root";
  doc.body.appendChild(host);
  const shadowRoot = host.attachShadow({ mode: "open" });
  return { host, shadowRoot };
}
