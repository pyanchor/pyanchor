export {};

declare global {
  interface Window {
    __PyanchorBootstrapLoaded?: boolean;
    __PyanchorConfig?: {
      baseUrl: string;
    };
  }
}

(() => {
  if (window.__PyanchorBootstrapLoaded) {
    return;
  }

  window.__PyanchorBootstrapLoaded = true;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  const scriptUrl = currentScript?.src ? new URL(currentScript.src, window.location.href) : null;
  const basePath = scriptUrl?.pathname.replace(/\/bootstrap\.js$/, "") ?? "/_pyanchor";
  const baseUrl = `${scriptUrl?.origin ?? window.location.origin}${basePath}`.replace(/\/+$/, "");

  window.__PyanchorConfig = { baseUrl };

  if (document.querySelector("script[data-pyanchor-overlay='1']")) {
    return;
  }

  const overlayScript = document.createElement("script");
  overlayScript.src = `${baseUrl}/overlay.js`;
  overlayScript.defer = true;
  overlayScript.dataset.pyanchorOverlay = "1";
  document.head.appendChild(overlayScript);
})();
