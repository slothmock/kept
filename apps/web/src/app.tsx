import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { DashboardApp } from "./DashboardApp.js";
import { LandingScreen } from "./screens/LandingScreen.js";
import { PublicInformationScreen } from "./screens/PublicInformationScreen.js";
import type { Session } from "./auth/session.js";

export function App({
  session,
}: {
  readonly session: Session;
}) {
  if (!session.isReady) {
    return (
      <main>
        <p aria-live="polite">
          Preparing your account…
        </p>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/"
        element={<LandingScreen session={session} />}
      />

      <Route path="/privacy" element={<PublicInformationScreen page="privacy" />} />
      <Route path="/terms" element={<PublicInformationScreen page="terms" />} />
      <Route path="/verification" element={<PublicInformationScreen page="verification" />} />

      <Route
        path="/dashboard"
        element={
          session.isAuthenticated ? (
            <DashboardApp
              session={session}
            />
          ) : (
            <Navigate
              to="/"
              replace
            />
          )
        }
      />

      <Route
        path="*"
        element={
          <Navigate
            to={
              session.isAuthenticated
                ? "/dashboard"
                : "/"
            }
            replace
          />
        }
      />
    </Routes>
  );
}