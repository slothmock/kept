import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "../../src/app.js";
import type { Session } from "../../src/auth/session.js";
import "../../src/styles.css";

const session: Session = {
  isReady: true,
  isAuthenticated: true,
  getAccessToken: async () => "browser-test-token",
  login: () => undefined,
  logout: () => undefined,
};

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");
createRoot(root).render(
  <BrowserRouter>
    <App session={session} />
  </BrowserRouter>,
);
