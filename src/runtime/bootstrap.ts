export {};

declare global {
  interface Window {
    __AIGDevtoolsBootstrapLoaded?: boolean;
    __AIGDevtoolsConfig?: {
      baseUrl: string;
    };
  }
}

(() => {
  if (window.__AIGDevtoolsBootstrapLoaded) {
    return;
  }

  window.__AIGDevtoolsBootstrapLoaded = true;

  const currentScript = document.currentScript as HTMLScriptElement | null;
  const scriptUrl = currentScript?.src ? new URL(currentScript.src, window.location.href) : null;
  const basePath = scriptUrl?.pathname.replace(/\/bootstrap\.js$/, "") ?? "/_aig";
  const baseUrl = `${scriptUrl?.origin ?? window.location.origin}${basePath}`.replace(/\/+$/, "");

  window.__AIGDevtoolsConfig = { baseUrl };

  if (document.querySelector("script[data-aig-overlay='1']")) {
    return;
  }

  const overlayScript = document.createElement("script");
  overlayScript.src = `${baseUrl}/overlay.js`;
  overlayScript.defer = true;
  overlayScript.dataset.aigOverlay = "1";
  document.head.appendChild(overlayScript);
})();
