import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "../app.js";
import type { Session } from "../session.js";
import "./styles.css";

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
