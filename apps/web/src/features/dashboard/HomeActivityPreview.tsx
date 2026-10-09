import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
} from "lucide-react";
import {
  useEffect,
  useState,
} from "react";

import type {
  TransactionDto,
  TransactionType,
} from "@/api/kept-api";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    const fractional = (amount % USDC_SCALE)
      .toString()
      .padStart(6, "0")
      .replace(/0+$/, "");

    return fractional
      ? `${whole}.${fractional} USDC`
      : `${whole} USDC`;
  } catch {
    return `${amountAtomic} ${asset}`;
  }
}

function isIncoming(type: TransactionType): boolean {
  return (
    type === "fiat_funding"
    || type === "crypto_funding"
    || type === "reward"
  );
}

function label(type: TransactionType): string {
  switch (type) {
    case "fiat_funding":
      return "Added funds";
    case "crypto_funding":
      return "Crypto deposit";
    case "savings_deposit":
      return "Added to savings";
    case "savings_withdrawal":
      return "Moved to available cash";
    case "crypto_withdrawal":
      return "Crypto withdrawal";
    case "fiat_withdrawal":
      return "Bank withdrawal";
    case "reward":
      return "Reward received";
  }
}

function iconFor(transaction: TransactionDto) {
  if (transaction.type === "reward") {
    return Gift;
  }

  return isIncoming(transaction.type)
    ? ArrowDownLeft
    : ArrowUpRight;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function HomeActivityPreview({
  loadTransactions,
}: {
  readonly loadTransactions: () => Promise<readonly TransactionDto[]>;
}) {
  const [transactions, setTransactions] =
    useState<readonly TransactionDto[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    void loadTransactions()
      .then((result) => {
        if (!cancelled) {
          setTransactions(result.slice(0, 3));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransactions([]);
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
  }, [loadTransactions]);

  if (loading) {
    return (
      <Card className="shadow-none">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-none">
      <CardContent className="divide-y divide-border p-0">
        {transactions.length === 0 ? (
          <div className="p-5">
            <p className="text-caption text-muted-foreground">
              No recent activity yet.
            </p>
          </div>
        ) : transactions.map((transaction) => {
          const Icon = iconFor(transaction);
          const incoming = isIncoming(transaction.type);

          return (
            <div
              key={transaction.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-medium">
                  {transaction.description || label(transaction.type)}
                </p>

                <p className="mt-0.5 text-caption text-muted-foreground">
                  {label(transaction.type)} · {formatDate(transaction.createdAt)}
                </p>
              </div>

              <p className="min-w-0 break-all text-right text-label font-medium tabular-nums max-sm:ml-12 max-sm:w-[calc(100%-3rem)] sm:shrink-0 sm:break-normal">
                {incoming ? "+" : "−"}
                {formatAmount(
                  transaction.amountAtomic,
                  transaction.asset,
                )}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
