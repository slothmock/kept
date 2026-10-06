import {
  usePrivySession,
} from "@/app/providers/privy-session";
import {
  AppRoutes,
} from "@/app/routes";

export function App() {
  const session =
    usePrivySession();

  if (!session.isReady) {
    return (
      <main className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        <p aria-live="polite">
          Preparing your account…
        </p>
      </main>
    );
  }

  return (
    <AppRoutes
      session={
        session
      }
    />
  );
}
