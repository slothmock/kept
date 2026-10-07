import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  History,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import {
  createKeptApi,
  readApiBaseUrl,
  type TransactionDto,
  type TransactionType,
} from "@/api/kept-api";
import { AppShell } from "@/app/layout/AppShell";
import type { Session } from "@/app/providers/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountMenu } from "@/features/account/components/AccountMenu";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";

const USDC_SCALE = 1_000_000n;

function formatAmount(
  amountAtomic: string,
  asset: string,
): string {
  if (asset !== "USDC") {
    return `${amountAtomic} ${asset}`;
  }

  try {
    const amount = BigInt(amountAtomic);
    const whole = amount / USDC_SCALE;
    const fractional = amount % USDC_SCALE;
    const visibleFraction = fractional
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "");

    return visibleFraction.length > 0
      ? `${whole}.${visibleFraction} USDC`
      : `${whole} USDC`;
  } catch {
    return `${amountAtomic} ${asset}`;
  }
}

function transactionLabel(type: TransactionType): string {
  switch (type) {
    case "fiat_funding":
      return "Added funds";
    case "crypto_funding":
      return "Crypto deposit";
    case "savings_deposit":
      return "Savings deposit";
    case "savings_withdrawal":
      return "Savings withdrawal";
    case "crypto_withdrawal":
      return "Crypto withdrawal";
    case "fiat_withdrawal":
      return "Bank withdrawal";
    case "reward":
      return "Commitment reward";
  }
}

function isIncoming(type: TransactionType): boolean {
  return (
    type === "fiat_funding"
    || type === "crypto_funding"
    || type === "reward"
  );
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function TransactionIcon({
  transaction,
}: {
  readonly transaction: TransactionDto;
}) {
  if (transaction.type === "reward") {
    return <Gift className="size-4" />;
  }

  return isIncoming(transaction.type)
    ? <ArrowDownLeft className="size-4" />
    : <ArrowUpRight className="size-4" />;
}

function statusVariant(
  status: TransactionDto["status"],
): "success" | "destructive" | "warning" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "destructive";
    case "pending":
      return "warning";
  }
}

export function ActivityPage({
  session,
}: {
  readonly session: Session;
}) {
  const navigate = useNavigate();

  const [transactions, setTransactions] =
    useState<readonly TransactionDto[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

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
    [apiBaseUrl, session.getAccessToken],
  );

  useEffect(() => {
    let cancelled = false;

    if (!api) {
      setLoading(false);
      setError("Activity is unavailable because Kept is not configured.");
      return;
    }

    setLoading(true);
    setError(null);

    void api
      .listTransactions()
      .then((result) => {
        if (!cancelled) {
          setTransactions(result);
        }
      })
      .catch((cause) => {
        diagnostics.warn(
          "activity.transactions_failed",
          cause,
        );

        if (!cancelled) {
          setTransactions([]);
          setError(
            consumerErrorMessage(
              cause,
              "We couldn't load your activity.",
            ),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <AppShell
      headerAction={
        <AccountMenu
          onOpenAccount={() => {
            navigate("/account");
          }}
          onSignOut={session.logout}
        />
      }
    >
      <div className="space-y-8">
        <section>
          <p className="text-caption font-medium text-primary">
            Activity
          </p>

          <h1 className="mt-2 text-h1 font-semibold tracking-tight">
            Your Kept activity.
          </h1>

          <p className="mt-2 max-w-2xl text-body text-muted-foreground">
            Deposits, withdrawals, funding, and rewards in one chronological view.
          </p>
        </section>

        <section
          className="space-y-4"
          aria-labelledby="activity-history-heading"
        >
          <div>
            <h2
              id="activity-history-heading"
              className="text-h2 font-semibold tracking-tight"
            >
              History
            </h2>

            <p className="mt-1 text-caption text-muted-foreground">
              Your most recent activity appears first.
            </p>
          </div>

          {loading ? (
            <Card className="shadow-none">
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="border-destructive/25 shadow-none">
              <CardContent className="p-5">
                <p className="text-caption text-destructive" role="alert">
                  {error}
                </p>
              </CardContent>
            </Card>
          ) : transactions.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
                  <History className="size-4" />
                </div>

                <p className="mt-4 text-label font-medium">
                  No activity yet
                </p>

                <p className="mt-1 max-w-md text-caption text-muted-foreground">
                  Your deposits, withdrawals, funding, and rewards will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden shadow-none">
              <CardContent className="divide-y divide-border p-0">
                {transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"
                  >
                    <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                      <TransactionIcon transaction={transaction} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="truncate text-label font-medium">
                            {transaction.description || transactionLabel(transaction.type)}
                          </p>

                          <p className="mt-1 text-caption text-muted-foreground">
                            {transactionLabel(transaction.type)}
                            {" · "}
                            {formatDate(transaction.createdAt)}
                          </p>
                        </div>

                        <div className="shrink-0 sm:text-right">
                          <p className="text-label font-semibold tabular-nums">
                            {isIncoming(transaction.type) ? "+" : "−"}
                            {formatAmount(
                              transaction.amountAtomic,
                              transaction.asset,
                            )}
                          </p>

                          <Badge
                            variant={statusVariant(transaction.status)}
                            className="mt-2"
                          >
                            {transaction.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </AppShell>
  );
}
