import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import type {
  Session,
} from "@/app/providers/session";
import {
  AccountPage,
} from "@/features/account/AccountPage";
import {
  DashboardController,
} from "@/features/dashboard/DashboardController";
import {
  LandingPage,
} from "@/features/public/LandingPage";
import {
  PublicInformationPage,
} from "@/features/public/PublicInformationPage";

export function AppRoutes({
  session,
}: {
  readonly session:
    Session;
}) {
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

      <Route
        path="/dashboard"
        element={
          session.isAuthenticated
            ? (
              <DashboardController
                session={
                  session
                }
              />
            )
            : (
              <Navigate
                to="/"
                replace
              />
            )
        }
      />

      <Route
        path="/goals"
        element={
          session.isAuthenticated
            ? (
              <DashboardController
                session={
                  session
                }
              />
            )
            : (
              <Navigate
                to="/"
                replace
              />
            )
        }
      />

      <Route
        path="/goals/:goalId"
        element={
          session.isAuthenticated
            ? (
              <DashboardController
                session={
                  session
                }
              />
            )
            : (
              <Navigate
                to="/"
                replace
              />
            )
        }
      />

      <Route
        path="/commitments"
        element={
          session.isAuthenticated
            ? (
              <DashboardController
                session={
                  session
                }
              />
            )
            : (
              <Navigate
                to="/"
                replace
              />
            )
        }
      />

      <Route
        path="/commitments/:commitmentId"
        element={
          session.isAuthenticated
            ? (
              <DashboardController
                session={
                  session
                }
              />
            )
            : (
              <Navigate
                to="/"
                replace
              />
            )
        }
      />

      <Route
        path="/account"
        element={
          session.isAuthenticated
            ? (
              <AccountPage
                session={
                  session
                }
              />
            )
            : (
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
