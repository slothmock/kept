import type { ReactNode } from "react";
import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import { AppShell } from "@/app/layout/AppShell";
import type {
  Session,
} from "@/app/providers/session";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AccountPage,
} from "@/features/account/AccountPage";
import {
  ActivityPage,
} from "@/features/activity/ActivityPage";
import {
  DashboardController,
} from "@/features/dashboard/DashboardController";
import {
  LandingPage,
} from "@/features/public/LandingPage";
import {
  PublicInformationPage,
} from "@/features/public/PublicInformationPage";

function ProtectedRoute({
  session,
  children,
}: {
  readonly session: Session;
  readonly children: ReactNode;
}) {
  if (!session.isReady) {
    return <ProtectedRouteSkeleton />;
  }

  if (!session.isAuthenticated) {
    return (
      <Navigate
        to="/"
        replace
      />
    );
  }

  return children;
}

function ProtectedRouteSkeleton() {
  return (
    <AppShell>
      <div
        className="space-y-8"
        aria-live="polite"
        aria-label="Preparing your Kept account"
      >
        <div className="space-y-3">
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-5 w-72 max-w-full rounded-md" />
        </div>

        <Skeleton className="h-56 w-full rounded-xl" />

        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
          <Skeleton className="h-36 rounded-lg" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>

        <span className="sr-only">
          Preparing your account…
        </span>
      </div>
    </AppShell>
  );
}

export function AppRoutes({
  session,
}: {
  readonly session:
    Session;
}) {
  const dashboard = (
    <ProtectedRoute session={session}>
      <DashboardController session={session} />
    </ProtectedRoute>
  );

  return (
    <Routes>
      <Route
        path="/"
        element={
          <LandingPage
            session={
              session
            }
          />
        }
      />

      <Route
        path="/privacy"
        element={
          <PublicInformationPage
            page="privacy"
          />
        }
      />

      <Route
        path="/terms"
        element={
          <PublicInformationPage
            page="terms"
          />
        }
      />

      <Route
        path="/verification"
        element={
          <PublicInformationPage
            page="verification"
          />
        }
      />

      <Route path="/dashboard" element={dashboard} />
      <Route path="/goals" element={dashboard} />
      <Route path="/goals/:goalId" element={dashboard} />
      <Route path="/commitments" element={dashboard} />
      <Route path="/commitments/:commitmentId" element={dashboard} />
      <Route path="/add-money" element={dashboard} />
      <Route path="/withdraw" element={dashboard} />

      <Route
        path="/activity"
        element={
          <ProtectedRoute session={session}>
            <ActivityPage session={session} />
          </ProtectedRoute>
        }
      />

      <Route
        path="/account"
        element={
          <ProtectedRoute session={session}>
            <AccountPage session={session} />
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          session.isReady
            ? (
              <Navigate
                to={
                  session.isAuthenticated
                    ? "/dashboard"
                    : "/"
                }
                replace
              />
            )
            : (
              <ProtectedRouteSkeleton />
            )
        }
      />
    </Routes>
  );
}
