import type { ComponentType, ReactNode } from "react";
import {
  Activity,
  HandCoins,
  Home,
  Target,
  UserRound,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import keptLogo from "@/assets/img/kept-logo-192x192.png";
import { cn } from "@/lib/utils";

interface AppShellProps {
  readonly children: ReactNode;
  readonly headerAction?: ReactNode;
}

interface NavigationItem {
  readonly label: string;
  readonly icon: ComponentType<{
    readonly className?: string;
  }>;
  readonly to: string;
}

type NavigationVariant =
  | "desktop"
  | "mobile";

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

      <span className="text-label">
        Kept
      </span>
    </Link>
  );
}

function PrimaryNavigation({
  variant,
}: {
  readonly variant: NavigationVariant;
}) {
  const desktop =
    variant === "desktop";

  return (
    <nav
      className={
        desktop
          ? "flex flex-col gap-1"
          : "flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2"
      }
      aria-label="Primary navigation"
    >
      {navigationItems.map((item) => {
        const Icon = item.icon;

        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                desktop
                  ? "flex items-center gap-3 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  : "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-label text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive
                  && "bg-accent text-accent-foreground",
              )
            }
          >
            <Icon className="size-4" />

            <span>
              {item.label}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppShell({
  children,
  headerAction,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 border-r border-border bg-surface md:flex md:flex-col">
        <div className="px-8 py-9">
          <KeptBrand />
        </div>

        <div className="flex-1 px-6">
          <PrimaryNavigation variant="desktop" />
        </div>

        {headerAction ? (
          <div className="flex justify-center border-t border-border p-3">
            {headerAction}
          </div>
        ) : null}
      </aside>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between gap-4 px-4">
          <KeptBrand />

          {headerAction}
        </div>

        <PrimaryNavigation variant="mobile" />
      </header>

      <div className="md:pl-56">
        <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 md:px-8 md:py-12 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
