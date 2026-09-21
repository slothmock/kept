import { Copy, LogOut, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";;
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface AccountMenuProps {
  readonly address: string;
  readonly onSignOut: () => void;
}

export function AccountMenu({ address, onSignOut }: AccountMenuProps) {
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
        <DropdownMenuItem onSelect={onSignOut} className="gap-2 text-destructive">
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
