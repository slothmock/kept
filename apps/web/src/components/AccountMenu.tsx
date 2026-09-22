import { useState } from "react";
import { Copy, LogOut, UserRound } from "lucide-react";

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

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface AccountMenuProps {
  readonly address: string;
  readonly onSignOut: () => Promise<void>;
}

export function AccountMenu({ address, onSignOut }: AccountMenuProps) {
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function signOut(): Promise<void> {
    setSignOutPending(true);
    setSignOutError(null);
    try {
      await onSignOut();
    } catch (error) {
      diagnostics.error("auth.sign_out_failed", error);
      setSignOutError(consumerErrorMessage(error, "We couldn't sign you out. Try again."));
    } finally {
      setSignOutPending(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <UserRound className="size-4" />
          <span className="hidden sm:inline">{shortAddress(address)}</span>
          <span className="sm:hidden">Account</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={() => void navigator.clipboard?.writeText(address)}
          className="gap-2"
        >
          <Copy className="size-4" />
          Copy wallet address
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signOutPending}
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
          className="gap-2 text-destructive"
        >
          <LogOut className="size-4" />
          {signOutPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
        {signOutError ? (
          <p className="max-w-56 px-2 py-1.5 text-xs text-destructive" role="alert">{signOutError}</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
