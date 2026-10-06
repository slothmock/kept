import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

import keptLogo from "@/assets/img/kept-logo-192x192.png";

interface AppShellProps {
  readonly children: ReactNode;
  readonly headerAction?: ReactNode;
}

export function AppShell({ children, headerAction }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
            aria-label="Kept home"
          >
            <img
              src={keptLogo}
              alt=""
              className="size-8 object-contain"
            />

            <span>Kept</span>
          </Link>

          <nav className="ml-auto flex items-center gap-1" aria-label="Primary navigation">
            <NavLink
              to="/dashboard"
              className={({ isActive }) => cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground",
              )}
            >
              Dashboard
            </NavLink>
            {headerAction}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {children}
      </main>
    </div>
  );
}
