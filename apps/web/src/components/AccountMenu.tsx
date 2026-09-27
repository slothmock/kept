import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";

interface AccountMenuProps {
  readonly onSignOut: () => Promise<void>;
  readonly onOpenAccount: () => void;
}

export function AccountMenu({ onSignOut, onOpenAccount }: AccountMenuProps) {
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setSignOutPending(true);
    setSignOutError(null);

    try {
      await onSignOut();
    } catch (error) {
      diagnostics.error("auth.sign_out_failed", error);

      setSignOutError(
        consumerErrorMessage(error, "We couldn't sign you out. Try again."),
      );
    } finally {
      setSignOutPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserRound className="size-4" />
          <span>My Account</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onOpenAccount} className="gap-2">
          <UserRound className="size-4" />
          My Account
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={signOutPending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />

          {signOutPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>

        {signOutError ? (
          <p
            className="max-w-56 px-2 py-1.5 text-xs text-destructive"
            role="alert"
          >
            {signOutError}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
