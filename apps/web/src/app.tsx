import { Navigate, Route, Routes } from "react-router-dom";

import type { Session } from "@/auth/session";
import { DashboardApp } from "@/DashboardApp";
import { LandingPage } from "@/pages/LandingPage";
import { PublicInformationScreen } from "@/pages/PublicInformationScreen";

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
      <Route path="/privacy" element={<PublicInformationScreen page="privacy" />} />
      <Route path="/terms" element={<PublicInformationScreen page="terms" />} />
      <Route path="/verification" element={<PublicInformationScreen page="verification" />} />
      <Route
        path="/dashboard"
        element={session.isAuthenticated ? <DashboardApp session={session} /> : <Navigate to="/" replace />}
      />
      <Route path="*" element={<Navigate to={session.isAuthenticated ? "/dashboard" : "/"} replace />} />
    </Routes>
  );
}
