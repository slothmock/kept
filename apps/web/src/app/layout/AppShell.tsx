import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  HandCoins,
  Home,
  Target,
  UserRound,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

import keptLogo from "@/assets/img/kept-logo-192x192.png";

interface AppShellProps {
  readonly children: ReactNode;
  readonly headerAction?: ReactNode;
}

interface NavigationItem {
  readonly label: string;
  readonly icon: ComponentType<{ readonly className?: string }>;
  readonly to?: string;
}

const navigationItems: readonly NavigationItem[] = [
  {
    label: "Home",
    icon: Home,
    to: "/dashboard",
  },
  {
    label: "Goals",
    icon: Target,
    to: "/goals",
  },
  {
    label: "Commitments",
    icon: HandCoins,
    to: "/commitments",
  },
  {
    label: "Activity",
    icon: Activity,
    to: "/activity",
  },
  {
    label: "Account",
    icon: UserRound,
    to: "/account",
  },
];

function KeptBrand() {
  return (
    <Link
      to="/dashboard"
      className="inline-flex items-center gap-2 font-semibold text-foreground"
      aria-label="Kept home"
    >
      <img
        src={keptLogo}
        alt=""
        className="size-7 object-contain"
      />
      <span className="text-label">Kept</span>
    </Link>
  );
}

function PrimaryNavigation() {
  return (
    <nav className="flex flex-col gap-1" aria-label="Primary navigation">
      {navigationItems.map((item) => {
        const Icon = item.icon;

        if (!item.to) {
          return (
            <div
              key={item.label}
              aria-disabled="true"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-label text-muted-foreground opacity-60"
              title={item.label + " page coming in the UI redesign"}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </div>
          );
        }

        return (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell({ children, headerAction }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-52 border-r border-border bg-surface md:flex md:flex-col">
        <div className="px-5 py-6">
          <KeptBrand />
        </div>

        <div className="flex-1 px-3">
          <PrimaryNavigation />
        </div>

        {headerAction ? (
          <div className="border-t border-border p-3">
            {headerAction}
          </div>
        ) : null}
      </aside>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between gap-4 px-4">
          <KeptBrand />
          {headerAction}
        </div>

        <nav
          className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2"
          aria-label="Primary navigation"
        >
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            Home
          </NavLink>

          <NavLink
            to="/goals"
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            Goals
          </NavLink>

          <NavLink
            to="/commitments"
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            Commitments
          </NavLink>

          <NavLink
            to="/activity"
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            Activity
          </NavLink>

          <NavLink
            to="/account"
            className={({ isActive }) =>
              cn(
                "shrink-0 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors",
                isActive && "bg-accent text-accent-foreground",
              )
            }
          >
            Account
          </NavLink>
        </nav>
      </header>

      <div className="md:pl-52">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:px-8 md:py-10 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
