import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface AppShellProps {
  readonly children: ReactNode;
  readonly headerAction?: ReactNode;
}

export function AppShell({
  children,
  headerAction,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <Link
            className="brand"
            to="/"
            aria-label="Kept home"
          >
            Kept
          </Link>

          <nav className="app-header__nav" aria-label="Primary navigation">
            <Link
              className="button button--quiet"
              to="/dashboard"
            >
              Dashboard
            </Link>
            <Link
              className="button button--quiet"
              to="/vaults"
            >
              Vaults
            </Link>
          </nav>
          {headerAction}
        </div>
      </header>

      <main className="app-content">
        {children}
      </main>
    </div>
  );
}