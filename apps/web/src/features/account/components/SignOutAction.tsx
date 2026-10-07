import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";

interface SignOutActionProps {
  readonly onSignOut: () => Promise<void>;
}

export function SignOutAction({
  onSignOut,
}: SignOutActionProps) {
  const [signOutPending, setSignOutPending] =
    useState(false);

  const [signOutError, setSignOutError] =
    useState<string | null>(null);

  async function signOut(): Promise<void> {
    setSignOutPending(true);
    setSignOutError(null);

    try {
      await onSignOut();
    } catch (error) {
      diagnostics.error(
        "auth.sign_out_failed",
        error,
      );

      setSignOutError(
        consumerErrorMessage(
          error,
          "We couldn't sign you out. Try again.",
        ),
      );
    } finally {
      setSignOutPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={signOutPending}
        onClick={() => {
          void signOut();
        }}
        className="justify-center text-muted-foreground hover:text-foreground"
      >
        <LogOut className="size-4" />
        {signOutPending
          ? "Signing out…"
          : "Sign out"}
      </Button>

      {signOutError ? (
        <p
          className="max-w-48 text-center text-xs text-destructive"
          role="alert"
        >
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
