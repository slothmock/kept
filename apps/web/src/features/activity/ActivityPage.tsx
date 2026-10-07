import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  Download,
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountMenu } from "@/features/account/components/AccountMenu";
import { consumerErrorMessage } from "@/lib/consumer-error";
import { diagnostics } from "@/lib/diagnostics";

const USDC_SCALE = 1_000_000n;

type ActivityFilter =
  | "all"
  | "money-in"
  | "money-out"
  | "rewards";

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
      return "Added to savings";
    case "savings_withdrawal":
      return "Moved to available cash";
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

function isOutgoing(type: TransactionType): boolean {
  return (
    type === "savings_withdrawal"
    || type === "crypto_withdrawal"
    || type === "fiat_withdrawal"
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

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
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

function filterMatches(
  transaction: TransactionDto,
  filter: ActivityFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "money-in":
      return isIncoming(transaction.type)
        && transaction.type !== "reward";
    case "money-out":
      return isOutgoing(transaction.type);
    case "rewards":
      return transaction.type === "reward";
  }
}

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadStatement(
  transactions: readonly TransactionDto[],
): void {
  const rows = [
    [
      "Date",
      "Description",
      "Type",
      "Status",
      "Amount",
      "Asset",
      "Chain ID",
      "Transaction hash",
      "External reference",
    ],
    ...transactions.map((transaction) => [
      transaction.createdAt,
      transaction.description,
      transaction.type,
      transaction.status,
      transaction.amountAtomic,
      transaction.asset,
      transaction.chainId ?? "",
      transaction.transactionHash ?? "",
      transaction.externalReference ?? "",
    ]),
  ];

  const csv = rows
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "kept-activity.csv";
  link.click();

  URL.revokeObjectURL(url);
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

  const [filter, setFilter] =
    useState<ActivityFilter>("all");

  const [expandedId, setExpandedId] =
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
      return;
    }

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

  const effectiveLoading =
    api !== null && loading;

  const effectiveError =
    api === null
      ? "Activity is unavailable because Kept is not configured."
      : error;

  const filteredTransactions =
    transactions.filter(
      (transaction) =>
        filterMatches(transaction, filter),
    );

  const todayTransactions =
    filteredTransactions.filter(
      (transaction) =>
        isToday(transaction.createdAt),
    );

  const earlierTransactions =
    filteredTransactions.filter(
      (transaction) =>
        !isToday(transaction.createdAt),
    );

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
        <section className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-h1 font-semibold tracking-tight">
            Activity
          </h1>

          <Button
            variant="outline"
            disabled={transactions.length === 0}
            onClick={() =>
              downloadStatement(transactions)
            }
          >
            <Download className="size-4" />
            Download statement
          </Button>
        </section>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Activity filters"
        >
          <FilterPill
            label="All"
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />

          <FilterPill
            label="Money in"
            active={filter === "money-in"}
            onClick={() => setFilter("money-in")}
          />

          <FilterPill
            label="Money out"
            active={filter === "money-out"}
            onClick={() => setFilter("money-out")}
          />

          <FilterPill
            label="Rewards"
            active={filter === "rewards"}
            onClick={() => setFilter("rewards")}
          />
        </div>

        {effectiveLoading ? (
          <Card className="shadow-none">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
              <Skeleton className="h-16 w-full rounded-md" />
            </CardContent>
          </Card>
        ) : effectiveError ? (
          <Card className="border-destructive/25 shadow-none">
            <CardContent className="p-5">
              <p
                className="text-caption text-destructive"
                role="alert"
              >
                {effectiveError}
              </p>
            </CardContent>
          </Card>
        ) : filteredTransactions.length === 0 ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
              <div className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground">
                <History className="size-4" />
              </div>

              <p className="mt-4 text-label font-medium">
                No matching activity
              </p>

              <p className="mt-1 max-w-md text-caption text-muted-foreground">
                Try another filter or check back after your next transaction.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {todayTransactions.length > 0 ? (
              <ActivityGroup
                title="Today"
                transactions={todayTransactions}
                expandedId={expandedId}
                onToggle={(transactionId) =>
                  setExpandedId(
                    expandedId === transactionId
                      ? null
                      : transactionId,
                  )
                }
              />
            ) : null}

            {earlierTransactions.length > 0 ? (
              <ActivityGroup
                title="Earlier"
                transactions={earlierTransactions}
                expandedId={expandedId}
                onToggle={(transactionId) =>
                  setExpandedId(
                    expandedId === transactionId
                      ? null
                      : transactionId,
                  )
                }
              />
            ) : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full border border-primary bg-primary px-4 py-2 text-label font-medium text-primary-foreground"
          : "rounded-full border border-border bg-surface px-4 py-2 text-label text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}

function ActivityGroup({
  title,
  transactions,
  expandedId,
  onToggle,
}: {
  readonly title: string;
  readonly transactions: readonly TransactionDto[];
  readonly expandedId: string | null;
  readonly onToggle: (transactionId: string) => void;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-label font-semibold">
        {title}
      </h2>

      <Card className="overflow-hidden shadow-none">
        <CardContent className="divide-y divide-border p-0">
          {transactions.map((transaction) => {
            const expanded =
              expandedId === transaction.id;

            const hasDetails =
              Boolean(
                transaction.chainId
                || transaction.transactionHash
                || transaction.externalReference
                || transaction.goalId,
              );

            return (
              <div key={transaction.id}>
                <button
                  type="button"
                  disabled={!hasDetails}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors enabled:hover:bg-accent/25 disabled:cursor-default"
                  onClick={() =>
                    onToggle(transaction.id)
                  }
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                    <TransactionIcon transaction={transaction} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label font-medium">
                      {transaction.description
                        || transactionLabel(transaction.type)}
                    </p>

                    <p className="mt-1 text-caption text-muted-foreground">
                      {title === "Today"
                        ? formatTime(transaction.createdAt)
                        : formatDate(transaction.createdAt)}
                      {" · "}
                      {transactionLabel(transaction.type)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-label font-semibold tabular-nums">
                      {isIncoming(transaction.type)
                        ? "+"
                        : isOutgoing(transaction.type)
                          ? "−"
                          : ""}
                      {formatAmount(
                        transaction.amountAtomic,
                        transaction.asset,
                      )}
                    </p>

                    {transaction.status !== "completed" ? (
                      <p
                        className={
                          transaction.status === "failed"
                            ? "mt-1 text-caption font-medium text-destructive"
                            : "mt-1 text-caption font-medium text-warning"
                        }
                      >
                        {transaction.status}
                      </p>
                    ) : null}
                  </div>

                  {hasDetails ? (
                    <ChevronDown
                      className={
                        expanded
                          ? "size-4 shrink-0 rotate-180 text-muted-foreground transition-transform"
                          : "size-4 shrink-0 text-muted-foreground transition-transform"
                      }
                    />
                  ) : null}
                </button>

                {expanded ? (
                  <div className="grid gap-3 bg-accent/20 px-5 py-4 text-caption sm:grid-cols-2">
                    {transaction.chainId ? (
                      <Detail
                        label="Network"
                        value={transaction.chainId}
                      />
                    ) : null}

                    {transaction.goalId ? (
                      <Detail
                        label="Goal reference"
                        value={transaction.goalId}
                      />
                    ) : null}

                    {transaction.transactionHash ? (
                      <Detail
                        label="Transaction hash"
                        value={transaction.transactionHash}
                      />
                    ) : null}

                    {transaction.externalReference ? (
                      <Detail
                        label="External reference"
                        value={transaction.externalReference}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">
        {label}
      </p>

      <p className="mt-1 break-all font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}
