import {
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  HelpCircle,
  LogOut,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { Session } from "@/auth/session";
import { useKeptEvmWallet } from "@/chain/evm-wallet";
import { AccountMenu } from "@/components/AccountMenu";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function AccountPage({ session }: { readonly session: Session }) {
  const navigate = useNavigate();

  const wallet = useKeptEvmWallet();

  const [copied, setCopied] = useState(false);

  const [signOutPending, setSignOutPending] = useState(false);

  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function copyAddress(): Promise<void> {
    if (!wallet.address) {
      return;
    }

    try {
      await navigator.clipboard.writeText(wallet.address);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1_500);
    } catch (error) {
      diagnostics.warn("account.address_copy_failed", error);
    }
  }

  async function signOut(): Promise<void> {
    setSignOutPending(true);
    setSignOutError(null);

    try {
      await session.logout();
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
    <AppShell
      headerAction={
        <AccountMenu
          onOpenAccount={() => {
            navigate("/account");
          }}
          onSignOut={async () => {
            session.logout();
          }}
        />
      }
    >
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 gap-2 text-muted-foreground"
            onClick={() => {
              navigate("/dashboard");
            }}
          >
            <ArrowLeft className="size-4" />
            Dashboard
          </Button>
        </div>

        <section>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-muted">
              <UserRound className="size-5" />
            </div>

            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                My Account
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                Manage your account access, privacy, and account details.
              </p>
            </div>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="size-4" />
              Account access
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Signed in</p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Your Kept account is currently active on this device.
                </p>
              </div>

              <Button
                variant="outline"
                disabled={signOutPending}
                onClick={() => {
                  void signOut();
                }}
                className="shrink-0"
              >
                <LogOut className="size-4" />

                {signOutPending ? "Signing out…" : "Sign out"}
              </Button>
            </div>

            {signOutError ? (
              <p className="mt-4 text-sm text-destructive" role="alert">
                {signOutError}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" />
              Privacy & information
            </CardTitle>
          </CardHeader>

          <CardContent className="divide-y p-0">
            <Button
              asChild
              variant="ghost"
              className="h-auto w-full justify-between rounded-none px-6 py-4 font-normal"
            >
              <Link to="/privacy">
                <div className="text-left">
                  <p className="text-sm font-medium">Privacy policy</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    How Kept handles your information.
                  </p>
                </div>

                <ExternalLink className="size-4 text-muted-foreground" />
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-auto w-full justify-between rounded-none px-6 py-4 font-normal"
            >
              <Link to="/terms">
                <div className="text-left">
                  <p className="text-sm font-medium">Terms of service</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    The terms that apply when using Kept.
                  </p>
                </div>

                <ExternalLink className="size-4 text-muted-foreground" />
              </Link>
            </Button>

            <Button
              asChild
              variant="ghost"
              className="h-auto w-full justify-between rounded-none px-6 py-4 font-normal"
            >
              <Link to="/verification">
                <div className="text-left">
                  <p className="text-sm font-medium">Verification</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    How Kept verifies commitments.
                  </p>
                </div>

                <ExternalLink className="size-4 text-muted-foreground" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HelpCircle className="size-4" />
              Help & support
            </CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-sm text-muted-foreground">
              Need help with your account or using Kept?
            </p>

            <Button variant="outline" className="mt-4" disabled>
              Contact support
            </Button>

            <p className="mt-2 text-xs text-muted-foreground">
              Support contact will be available before launch.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <WalletCards className="size-4" />
              Advanced
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Kept account address</p>

              <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                Kept uses this account behind the scenes to manage your savings.
                You normally won't need to use it.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <code className="break-all text-sm tabular-nums text-muted-foreground">
                  {wallet.address
                    ? shortAddress(wallet.address)
                    : "Account not ready"}
                </code>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={!wallet.address}
                  onClick={() => {
                    void copyAddress();
                  }}
                  className="shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="size-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
