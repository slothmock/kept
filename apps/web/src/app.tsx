import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { DashboardApp } from "./DashboardApp.js";
import { LandingScreen } from "./screens/LandingScreen.js";
import { PublicInformationScreen } from "./screens/PublicInformationScreen.js";
import { VaultsScreen } from "./screens/VaultsScreen.js";
import type { Session } from "./session.js";

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
      <Route path="/sponsors" element={<PublicInformationScreen page="sponsors" />} />

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
        path="/vaults"
        element={session.isAuthenticated ? <VaultsScreen /> : <Navigate to="/" replace />}
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