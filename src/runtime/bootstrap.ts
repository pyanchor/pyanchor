export {};

declare global {
  interface Window {
    __PyanchorBootstrapLoaded?: boolean;
    __PyanchorConfig?: {
      baseUrl: string;
      token: string;
    };
  }
}

const DEFAULT_TRUSTED_HOSTS = ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"];

const isTrustedHost = (hostname: string, allowList: string[]): boolean => {
  const trimmed = hostname.toLowerCase();
  if (!trimmed) return false;
  for (const entry of allowList) {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) continue;
    if (pattern === trimmed) return true;
    if (pattern === ".local" && trimmed.endsWith(".local")) return true;
    if (pattern.startsWith("*.") && trimmed.endsWith(pattern.slice(1))) return true;
    if (pattern.startsWith(".") && trimmed.endsWith(pattern)) return true;
  }
  return false;
};

(() => {
  if (window.__PyanchorBootstrapLoaded) {
    return;
  }

  window.__PyanchorBootstrapLoaded = true;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  const scriptUrl = currentScript?.src ? new URL(currentScript.src, window.location.href) : null;
  const basePath = scriptUrl?.pathname.replace(/\/bootstrap\.js$/, "") ?? "/_pyanchor";
  const baseUrl = `${scriptUrl?.origin ?? window.location.origin}${basePath}`.replace(/\/+$/, "");
  const token = currentScript?.dataset.pyanchorToken?.trim() ?? "";

  // Hostname allowlist defense.
  // Even if the host page accidentally renders the <script> in a production
  // build, the overlay never loads on hosts outside the trusted list. Override
  // by setting `data-pyanchor-trusted-hosts="staging.example.com,foo.local"`.
  const customHosts = currentScript?.dataset.pyanchorTrustedHosts?.trim();
  const allowList = customHosts ? customHosts.split(",") : DEFAULT_TRUSTED_HOSTS;
  if (!isTrustedHost(window.location.hostname, allowList)) {
    console.warn(
      `[pyanchor] overlay disabled on untrusted host "${window.location.hostname}". ` +
        `Add it to data-pyanchor-trusted-hosts on the <script> tag if this is intentional.`
    );
    return;
  }

  window.__PyanchorConfig = { baseUrl, token };

  if (document.querySelector("script[data-pyanchor-overlay='1']")) {
    return;
  }

  const overlayScript = document.createElement("script");
  overlayScript.src = `${baseUrl}/overlay.js`;
  overlayScript.defer = true;
  overlayScript.dataset.pyanchorOverlay = "1";
  document.head.appendChild(overlayScript);
})();
