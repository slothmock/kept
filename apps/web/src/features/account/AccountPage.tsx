import {
  Check,
  Copy,
  ExternalLink,
  Info,
  LogOut,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
} from "react-router-dom";

import {
  createKeptApi,
  readApiBaseUrl,
  type SavingsMarketStatusDto,
} from "@/api/kept-api";
import { AppShell } from "@/app/layout/AppShell";
import type { Session } from "@/app/providers/session";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  readSavingsTransparency,
  type SavingsTransparency,
} from "@/features/account/savings-transparency";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";
import { useKeptEvmWallet } from "@/wallet/evm-wallet";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatBps(basisPoints: number): string {
  return `${(basisPoints / 100).toFixed(2)}%`;
}

function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p className="text-caption text-muted-foreground">
        {label}
      </p>

      <p className="text-right text-label font-medium tabular-nums">
        {value}
      </p>
    </div>
  );
}

function AccountAddress({
  address,
}: {
  readonly address: string;
}) {
  const [copied, setCopied] =
    useState(false);

  async function copyAddress(): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1_500);
    } catch (error) {
      diagnostics.warn(
        "account.address_copy_failed",
        error,
      );
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-caption text-muted-foreground">
          Kept wallet
        </p>

        <code className="mt-1 block text-label tabular-nums">
          {shortAddress(address)}
        </code>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          void copyAddress();
        }}
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
  );
}

export function AccountPage({
  session,
}: {
  readonly session: Session;
}) {
  const wallet = useKeptEvmWallet();

  const [signOutPending, setSignOutPending] =
    useState(false);

  const [signOutError, setSignOutError] =
    useState<string | null>(null);

  const [transparency, setTransparency] =
    useState<SavingsTransparency | null>(null);

  const [transparencyLoading, setTransparencyLoading] =
    useState(true);

  const [marketStatus, setMarketStatus] =
    useState<SavingsMarketStatusDto | null>(null);

  const [marketLoading, setMarketLoading] =
    useState(true);

  const apiBaseUrl = useMemo(
    () => readApiBaseUrl(import.meta.env),
    [],
  );

  const api = useMemo(
    () =>
      apiBaseUrl
        ? createKeptApi({
          baseUrl: apiBaseUrl,
          getAccessToken: session.getAccessToken,
        })
        : null,
    [
      apiBaseUrl,
      session.getAccessToken,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    void readSavingsTransparency()
      .then((result) => {
        if (!cancelled) {
          setTransparency(result);
        }
      })
      .catch((error) => {
        diagnostics.warn(
          "account.transparency_failed",
          error,
        );

        if (!cancelled) {
          setTransparency(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setTransparencyLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!api) {
      return;
    }

    void api
      .getSavingsMarketStatus()
      .then((status) => {
        if (!cancelled) {
          setMarketStatus(status);
        }
      })
      .catch((error) => {
        diagnostics.warn(
          "account.market_status_failed",
          error,
        );

        if (!cancelled) {
          setMarketStatus(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMarketLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  async function signOut(): Promise<void> {
    setSignOutPending(true);
    setSignOutError(null);

    try {
      await session.logout();
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
    <AppShell>
      <div className="space-y-8">
        <section>
          <h1 className="text-h1 font-semibold tracking-tight">
            Account & privacy
          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Manage your account and see how Kept handles your wallet, savings, and account information.
          </p>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold tracking-tight">
                Your Kept account
              </h2>

              <Card className="shadow-none">
                <CardContent className="divide-y divide-border p-5">
                  <div className="flex items-start gap-3 py-3">
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                      <UserRound className="size-4" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-label font-semibold">
                        {session.email ?? "Kept account"}
                      </p>

                      <p className="mt-1 text-caption text-muted-foreground">
                        Signed in with email
                      </p>
                    </div>
                  </div>

                  <DetailRow
                    label="Sign-in method"
                    value="Email"
                  />
                </CardContent>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-h3 font-semibold tracking-tight">
                Wallet
              </h2>

              <Card className="shadow-none">
                <CardContent className="divide-y divide-border p-5">
                  {wallet.address ? (
                    <AccountAddress address={wallet.address} />
                  ) : (
                    <DetailRow
                      label="Kept wallet"
                      value="Account not ready"
                    />
                  )}

                  {transparencyLoading ? (
                    <div className="space-y-3 py-4">
                      <Skeleton className="h-5 w-full" />
                      <Skeleton className="h-5 w-full" />
                    </div>
                  ) : transparency ? (
                    <>
                      <DetailRow
                        label="Network"
                        value={transparency.networkName}
                      />

                      <DetailRow
                        label="Savings asset"
                        value={transparency.savingsAsset}
                      />
                    </>
                  ) : (
                    <p className="py-4 text-caption text-muted-foreground">
                      Wallet details are currently unavailable.
                    </p>
                  )}

                  <p className="py-4 text-caption text-muted-foreground">
                    Kept uses your embedded wallet behind the scenes for savings transactions.
                  </p>
                </CardContent>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-h3 font-semibold tracking-tight">
                Security & account
              </h2>

              <Card className="shadow-none">
                <CardContent className="divide-y divide-border p-5">
                  <div className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-label font-medium">
                        Sign out
                      </p>

                      <p className="mt-1 text-caption text-muted-foreground">
                        End your current Kept session.
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={signOutPending}
                      onClick={() => {
                        void signOut();
                      }}
                    >
                      <LogOut className="size-4" />
                      {signOutPending
                        ? "Signing out…"
                        : "Sign out"}
                    </Button>
                  </div>

                  {signOutError ? (
                    <p
                      className="py-3 text-caption text-destructive"
                      role="alert"
                    >
                      {signOutError}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </section>
          </div>

          <div className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-h3 font-semibold tracking-tight">
                Privacy controls
              </h2>

              <Card className="shadow-none">
                <CardContent className="divide-y divide-border p-0">
                  <PrivacyLink
                    to="/privacy"
                    title="Privacy policy"
                    description="How Kept handles your information."
                  />

                  <PrivacyLink
                    to="/verification"
                    title="Commitment verification"
                    description="What Kept checks when verifying commitments."
                  />

                  <PrivacyLink
                    to="/terms"
                    title="Terms of service"
                    description="The terms that apply when using Kept."
                  />
                </CardContent>
              </Card>
            </section>

            <section className="space-y-3">
              <h2 className="text-h3 font-semibold tracking-tight">
                What stays where
              </h2>

              <Card className="shadow-none">
                <CardContent className="space-y-5 p-5">
                  <InfoRow
                    icon={ShieldCheck}
                    title="Account information"
                    description="Your login and product data are handled by Kept's application services."
                  />

                  <InfoRow
                    icon={WalletCards}
                    title="Savings"
                    description={
                      transparency
                        ? `Savings use ${transparency.savingsAsset} on ${transparency.networkName}.`
                        : "Savings are held through Kept's configured on-chain savings infrastructure."
                    }
                  />

                  <InfoRow
                    icon={Info}
                    title="Yield & fees"
                    description={
                      transparency
                        ? `Yield comes from Aave. Deposit fee: ${transparency.depositFeeBps !== null ? formatBps(transparency.depositFeeBps) : "unavailable"}. Performance fee: ${transparency.performanceFeeBps !== null ? `${formatBps(transparency.performanceFeeBps)} of earnings` : "unavailable"}.`
                        : "Yield and fee details are currently unavailable."
                    }
                  />

                  <div className="rounded-lg bg-accent/30 p-4">
                    <p className="text-caption text-muted-foreground">
                      Current APY
                    </p>

                    {api && marketLoading ? (
                      <Skeleton className="mt-2 h-6 w-20" />
                    ) : (
                      <p className="mt-1 text-h3 font-semibold tabular-nums">
                        {marketStatus
                          ? `${(Number(marketStatus.netApyBps) / 100).toFixed(2)}%`
                          : "Unavailable"}
                      </p>
                    )}

                    <p className="mt-1 text-caption text-muted-foreground">
                      Variable and shown after Kept&apos;s performance fee.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function PrivacyLink({
  to,
  title,
  description,
}: {
  readonly to: string;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <Button
      render={<Link to={to} />}
      variant="ghost"
      className="h-auto w-full justify-between rounded-none px-5 py-4 font-normal"
    >
      <div className="text-left">
        <p className="text-label font-medium">
          {title}
        </p>

        <p className="mt-1 text-caption text-muted-foreground">
          {description}
        </p>
      </div>

      <ExternalLink className="size-4 text-muted-foreground" />
    </Button>
  );
}

function InfoRow({
  icon: Icon,
  title,
  description,
}: {
  readonly icon: typeof ShieldCheck;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>

      <div>
        <p className="text-label font-medium">
          {title}
        </p>

        <p className="mt-1 text-caption text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
