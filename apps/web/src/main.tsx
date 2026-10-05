import { createRoot } from "react-dom/client";

import {
  AppProviders,
} from "@/app/AppProviders";
import {
  resolveAppBootstrap,
} from "@/app/bootstrap-config";
import { KeptApp } from "@/KeptApp";
import { diagnostics } from "@/lib/diagnostics";

import "@/styles.css";

window.addEventListener(
  "error",
  (event) => {
    diagnostics.error(
      "app.unhandled_error",
      event.error ??
      new Error(
        event.message,
      ),
    );
  },
);

window.addEventListener(
  "unhandledrejection",
  (event) => {
    diagnostics.error(
      "app.unhandled_rejection",
      event.reason,
    );
  },
);

const root =
  document.getElementById(
    "root",
  );

if (!root) {
  throw new Error(
    "Missing root element",
  );
}

const bootstrap =
  resolveAppBootstrap(
    import.meta.env,
  );

if (
  bootstrap.kind ===
  "error"
) {
  root.textContent =
    bootstrap.message;
} else {
  createRoot(root).render(
    <AppProviders
      config={
        bootstrap.config
      }
    >
      <KeptApp />
    </AppProviders>,
  );
}
