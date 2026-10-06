import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  getAddress,
  type Address,
} from "viem";

import type {
  KeptApi,
  MoonPayOfframpOrderDto,
} from "@/api/kept-api";
import type {
  EthereumProvider,
} from "@/chain/evm-wallet";
import {
  createKeptIntentsRunner,
} from "@/features/funding/intents/runner";
import {
  resolveKeptWithdrawalAsset,
  type FundingAsset,
} from "@/features/funding/intents/supported-tokens";
import {
  previewCryptoWithdrawal,
} from "@/features/withdrawals/preview-crypto-withdrawal";
import {
  consumeMoonPayReturnUrl,
} from "@/features/withdrawals/moonpay-return";
import {
  bankWithdrawalRefreshState,
  createBankWithdrawalOrderStore,
  createBankWithdrawalTransferStore,
  type BankWithdrawalPhase,
  type BankWithdrawalTransferStore,
} from "@/features/withdrawals/bank-withdrawal-lifecycle";
import {
  formatUsdc,
} from "@/features/savings/format";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";

interface UseBankWithdrawalOrderControllerInput {
  readonly api:
    KeptApi | null;

  readonly fiatEnabled:
    boolean;

  readonly account:
    Address | null;

  readonly ensureTransactionNetwork:
    () => Promise<void>;

  readonly getProvider:
    () => Promise<EthereumProvider | null>;
}

export interface BankWithdrawalOrderController {
  readonly phase:
    BankWithdrawalPhase;

  readonly orderId:
    string | null;

  readonly order:
    MoonPayOfframpOrderDto | null;

  readonly destinationAsset:
    FundingAsset | null;

  readonly minimumReceive:
    string | null;

  readonly status:
    string | null;

  readonly error:
    string | null;

  readonly transferStore:
    BankWithdrawalTransferStore;

  readonly beginMoonPayOrder:
    (orderId: string) => void;

  readonly resetOrder:
    () => void;

  readonly refreshOrder:
    (orderId: string) => Promise<boolean>;
}

export function useBankWithdrawalOrderController({
  api,
  fiatEnabled,
  account,
  ensureTransactionNetwork,
  getProvider,
}: UseBankWithdrawalOrderControllerInput): BankWithdrawalOrderController {
  const [
    phase,
    setPhase,
  ] =
    useState<BankWithdrawalPhase>(
      "setup",
    );

  const [
    orderId,
    setOrderId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    order,
    setOrder,
  ] =
    useState<MoonPayOfframpOrderDto | null>(
      null,
    );

  const [
    destinationAsset,
    setDestinationAsset,
  ] =
    useState<FundingAsset | null>(
      null,
    );

  const [
    minimumReceive,
    setMinimumReceive,
  ] =
    useState<string | null>(
      null,
    );

  const [
    status,
    setStatus,
  ] =
    useState<string | null>(
      null,
    );

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const transferStore =
    useMemo(
      () =>
        createBankWithdrawalTransferStore(
          globalThis.localStorage,
        ),
      [],
    );

  const orderStore =
    useMemo(
      () =>
        account
          ? createBankWithdrawalOrderStore(
              globalThis.localStorage,
              account,
            )
          : null,
      [
        account,
      ],
    );

  const resetOrder =
    useCallback(
      () => {
        setOrderId(
          null,
        );
        setOrder(
          null,
        );
        setDestinationAsset(
          null,
        );
        setMinimumReceive(
          null,
        );
        setStatus(
          null,
        );
        setError(
          null,
        );
        setPhase(
          "setup",
        );
      },
      [],
    );

  const beginMoonPayOrder =
    useCallback(
      (
        nextOrderId:
          string,
      ) => {
        orderStore?.save(
          nextOrderId,
        );

        setOrderId(
          nextOrderId,
        );
        setOrder(
          null,
        );
        setDestinationAsset(
          null,
        );
        setMinimumReceive(
          null,
        );
        setError(
          null,
        );
        setStatus(
          "Finish your bank payout setup in the MoonPay window.",
        );
        setPhase(
          "moonpay",
        );
      },
      [
        orderStore,
      ],
    );

  useEffect(
    () => {
      const moonPayReturn =
        consumeMoonPayReturnUrl(
          globalThis.location.href,
        );

      if (
        !fiatEnabled
      ) {
        orderStore?.clear();

        if (
          moonPayReturn
        ) {
          globalThis.history.replaceState(
            globalThis.history.state,
            "",
            moonPayReturn.cleanedPath,
          );
        }

        return;
      }

      if (
        !api
        || !moonPayReturn
      ) {
        return;
      }

      const {
        orderId:
          returnedOrderId,
        cleanedPath,
      } =
        moonPayReturn;

      globalThis.history.replaceState(
        globalThis.history.state,
        "",
        cleanedPath,
      );

      orderStore?.save(
        returnedOrderId,
      );

      queueMicrotask(
        () => {
          setOrderId(
            returnedOrderId,
          );
          setOrder(
            null,
          );
          setDestinationAsset(
            null,
          );
          setMinimumReceive(
            null,
          );
          setError(
            null,
          );
          setStatus(
            "Preparing your bank withdrawal…",
          );
          setPhase(
            "waiting",
          );
        },
      );
    },
    [
      api,
      fiatEnabled,
      orderStore,
    ],
  );

  useEffect(
    () => {
      if (
        !fiatEnabled
        || !api
        || !orderStore
      ) {
        orderStore?.clear();
        return;
      }

      if (
        orderId
      ) {
        orderStore.save(
          orderId,
        );
        return;
      }

      const recoveredOrderId =
        orderStore.load();

      if (
        !recoveredOrderId
      ) {
        return;
      }

      queueMicrotask(
        () => {
          setOrderId(
            recoveredOrderId,
          );
          setOrder(
            null,
          );
          setDestinationAsset(
            null,
          );
          setMinimumReceive(
            null,
          );
          setError(
            null,
          );
          setStatus(
            "Checking your bank withdrawal…",
          );
          setPhase(
            "waiting",
          );
        },
      );
    },
    [
      api,
      fiatEnabled,
      orderId,
      orderStore,
    ],
  );

  const refreshOrder =
    useCallback(
      async (
        currentOrderId:
          string,
      ): Promise<boolean> => {
        if (
          !fiatEnabled
          || !api
        ) {
          return false;
        }

        try {
          let nextOrder =
            await api
              .getMoonPayOfframpOrder(
                currentOrderId,
              );

          const pendingTransferReference =
            transferStore.load(
              currentOrderId,
            );

          if (
            nextOrder.status
              === "ready"
            && pendingTransferReference
          ) {
            try {
              nextOrder =
                await api
                  .markMoonPayOfframpFundsSent(
                    currentOrderId,
                    pendingTransferReference,
                  );

              transferStore.clear(
                currentOrderId,
              );
            } catch (
              acknowledgementError
            ) {
              diagnostics.warn(
                "withdrawal.bank_acknowledgement_retry_failed",
                acknowledgementError,
              );

              setOrder(
                nextOrder,
              );
              setStatus(
                "Your transfer was sent. Kept is confirming it now…",
              );
              setError(
                null,
              );
              setPhase(
                "processing",
              );

              return false;
            }
          }

          setOrder(
            nextOrder,
          );

          const lifecycle =
            bankWithdrawalRefreshState(
              nextOrder.status,
            );

          if (
            nextOrder.status
              === "completed"
          ) {
            transferStore.clear(
              currentOrderId,
            );
            orderStore?.clear();
            setStatus(
              "Your bank withdrawal has been completed.",
            );
            setError(
              null,
            );
            setPhase(
              lifecycle.phase,
            );

            return lifecycle.settled;
          }

          if (
            nextOrder.status
              === "failed"
            || nextOrder.status
              === "cancelled"
          ) {
            transferStore.clear(
              currentOrderId,
            );
            orderStore?.clear();
            setStatus(
              null,
            );
            setError(
              nextOrder.status
                === "cancelled"
                ? "This bank withdrawal was cancelled."
                : "This bank withdrawal could not be completed.",
            );
            setPhase(
              lifecycle.phase,
            );

            return lifecycle.settled;
          }

          if (
            nextOrder.status
              === "funds_sent"
          ) {
            transferStore.clear(
              currentOrderId,
            );
            setStatus(
              "Your withdrawal has been sent for bank payout processing.",
            );
            setError(
              null,
            );
            setPhase(
              lifecycle.phase,
            );

            return lifecycle.settled;
          }

          if (
            nextOrder.status
              !== "ready"
            || !nextOrder
              .depositWalletAddress
            || !nextOrder
              .moonPayTransactionId
          ) {
            setStatus(
              "Preparing your bank withdrawal…",
            );
            setError(
              null,
            );
            setPhase(
              "waiting",
            );

            return false;
          }

          if (
            !account
          ) {
            setStatus(
              "Getting your Kept account ready…",
            );
            setPhase(
              "waiting",
            );

            return false;
          }

          const nextDestinationAsset =
            await resolveKeptWithdrawalAsset({
              blockchain:
                "base",
              symbol:
                "USDC",
            });

          await ensureTransactionNetwork();

          const provider =
            await getProvider();

          if (
            !provider
          ) {
            throw new Error(
              "Wallet provider is unavailable.",
            );
          }

          const runner =
            createKeptIntentsRunner({
              sourceAddress:
                account,
              family:
                "evm",
              provider,
            });

          try {
            const {
              preview,
            } =
              await previewCryptoWithdrawal({
                runner,
                amount:
                  BigInt(
                    nextOrder
                      .amountAtomic,
                  ),
                recipient:
                  getAddress(
                    nextOrder
                      .depositWalletAddress,
                  ),
                destinationAsset:
                  nextDestinationAsset,
              });

            setMinimumReceive(
              formatUsdc(
                BigInt(
                  preview
                    .execution
                    .quote
                    .minAmountOut,
                ),
              ),
            );
          } finally {
            runner.dispose?.();
          }

          setDestinationAsset(
            nextDestinationAsset,
          );
          setStatus(
            null,
          );
          setError(
            null,
          );
          setPhase(
            "review",
          );

          return true;
        } catch (
          refreshError
        ) {
          diagnostics.warn(
            "withdrawal.bank_order_refresh_failed",
            refreshError,
          );

          if (
            transferStore.load(
              currentOrderId,
            )
          ) {
            setStatus(
              "Your transfer was sent. Kept is confirming it now…",
            );
            setError(
              null,
            );
            setPhase(
              "processing",
            );

            return false;
          }

          setStatus(
            null,
          );
          setError(
            consumerErrorMessage(
              refreshError,
              "We couldn't prepare your bank withdrawal. Try again.",
            ),
          );
          setPhase(
            "failed",
          );

          return true;
        }
      },
      [
        account,
        api,
        ensureTransactionNetwork,
        fiatEnabled,
        getProvider,
        orderStore,
        transferStore,
      ],
    );

  useEffect(
    () => {
      if (
        (
          phase
            !== "waiting"
          && phase
            !== "processing"
        )
        || !orderId
      ) {
        return;
      }

      let cancelled =
        false;

      let timeout:
        ReturnType<
          typeof globalThis.setTimeout
        >
        | null =
          null;

      const poll =
        async () => {
          const settled =
            await refreshOrder(
              orderId,
            );

          if (
            settled
            || cancelled
          ) {
            return;
          }

          const delay =
            phase
              === "processing"
              ? 10_000
              : 2_000;

          timeout =
            globalThis.setTimeout(
              () => {
                void poll();
              },
              delay,
            );
        };

      void poll();

      return () => {
        cancelled =
          true;

        if (
          timeout
            !== null
        ) {
          globalThis.clearTimeout(
            timeout,
          );
        }
      };
    },
    [
      orderId,
      phase,
      refreshOrder,
    ],
  );

  return {
    phase,
    orderId,
    order,
    destinationAsset,
    minimumReceive,
    status,
    error,
    transferStore,
    beginMoonPayOrder,
    resetOrder,
    refreshOrder,
  };
}
