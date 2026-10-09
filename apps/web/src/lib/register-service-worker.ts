import { diagnostics } from "@/lib/diagnostics";

export function registerKeptServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch((error: unknown) => {
        diagnostics.warn("pwa.service_worker_registration_failed", error);
      });
  }, { once: true });
}
