import { Navigate, Route, Routes } from "react-router-dom";

import type { Session } from "@/auth/session";
import { DashboardController } from "@/features/dashboard/DashboardController";
import { AccountPage } from "@/features/account/AccountPage";
import { LandingPage } from "@/features/public/LandingPage";
import { PublicInformationPage } from "@/features/public/PublicInformationPage";

export function App({ session }: { readonly session: Session }) {
  if (!session.isReady) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        <p aria-live="polite">Preparing your account…</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage session={session} />} />

      <Route
        path="/privacy"
        element={<PublicInformationPage page="privacy" />}
      />

      <Route path="/terms" element={<PublicInformationPage page="terms" />} />

      <Route
        path="/verification"
        element={<PublicInformationPage page="verification" />}
      />

      <Route
        path="/dashboard"
        element={
          session.isAuthenticated ? (
            <DashboardController session={session} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/account"
        element={
          session.isAuthenticated ? (
            <AccountPage session={session} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="*"
        element={
          <Navigate to={session.isAuthenticated ? "/dashboard" : "/"} replace />
        }
      />
    </Routes>
  );
}
