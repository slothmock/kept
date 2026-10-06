import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  getAddress,
  type Address,
  type Hex,
} from "viem";

import type {
  KeptApi,
} from "@/api/kept-api";
import type {
  TransactionSender,
} from "@/application/ports/blockchain";
import {
  deliverBankWithdrawal,
  type BankWithdrawalPhase,
} from "@/features/withdrawals/core/bank-withdrawal";
import type {
  EthereumProvider,
} from "@/wallet/evm-wallet";
import {
  createKeptIntentsRunner,
} from "@/features/funding/intents/runner";
import {
  useBankWithdrawalOrderController,
} from "@/features/withdrawals/use-bank-withdrawal-order-controller";
import {
  executeCryptoWithdrawal,
} from "@/features/withdrawals/execute-crypto-withdrawal";
import {
  formatUsdc,
} from "@/features/savings/format";
import {
  consumerErrorMessage,
} from "@/lib/consumer-error";
import {
  diagnostics,
} from "@/lib/diagnostics";
import type {
  VaultConfig,
} from "@/vault/config";
import {
  parseUsdcDepositAmount,
} from "@/vault/deposit-input";
import {
  submitVaultWithdrawal,
} from "@/vault/executor";
import type {
  VaultPosition,
} from "@/vault/position";
import type {
  VaultTransactionCoordinator,
} from "@/vault/transaction-lock";
import {
  buildVaultWithdrawTransaction,
} from "@/vault/transactions";

interface UseBankWithdrawalControllerInput {
  readonly api:
    KeptApi | null;

  readonly fiatEnabled:
    boolean;

  readonly account:
    Address | null;

  readonly config:
    VaultConfig | null;

  readonly position:
    VaultPosition | null;

  readonly sender:
    TransactionSender;

  readonly transactionCoordinator:
    VaultTransactionCoordinator;

  readonly ensureTransactionNetwork:
    () => Promise<void>;

  readonly waitForTransactionReceipt:
    ((
      hash: Hex,
    ) => Promise<{
      readonly status:
        "success"
        | "reverted";
    }>)
    | null;

  readonly getProvider:
    () => Promise<
      EthereumProvider | null
    >;

  readonly refreshPosition:
    () => Promise<void>;

  readonly refreshProductData:
    () => Promise<void>;
}

export interface BankWithdrawalController {
  readonly amount:
    string;

  readonly submitting:
    boolean;

  readonly status:
    string | null;

  readonly error:
    string | null;

  readonly orderId:
    string | null;

  readonly phase:
    BankWithdrawalPhase;

  readonly reviewAmount:
    string | null;

  readonly minimumReceive:
    string | null;

  readonly setAmount:
    (value: string) => void;

  readonly start:
    () => Promise<void>;

  readonly refresh:
    () => Promise<void>;

  readonly confirm:
    () => Promise<void>;
}

export function useBankWithdrawalController({
  api,
  fiatEnabled,
  account,
  config,
  position,
  sender,
  transactionCoordinator,
  ensureTransactionNetwork,
  waitForTransactionReceipt,
  getProvider,
  refreshPosition,
  refreshProductData,
}: UseBankWithdrawalControllerInput):
  BankWithdrawalController {
  const [
    amount,
    setAmountState,
  ] =
    useState("");

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    actionStatus,
    setActionStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    actionError,
    setActionError,
  ] =
    useState<
      string | null
    >(null);

  const [
    actionPhase,
    setActionPhase,
  ] =
    useState<BankWithdrawalPhase>(
      "setup",
    );

  const [
    actionActive,
    setActionActive,
  ] =
    useState(false);

  const order =
    useBankWithdrawalOrderController({
      api,
      fiatEnabled,
      account,
      ensureTransactionNetwork,
      getProvider,
    });

  const status =
    actionActive
      ? actionStatus
      : order.status;

  const error =
    actionActive
      ? actionError
      : order.error;

  const phase =
    actionActive
      ? actionPhase
      : order.phase;

  useEffect(
    () => {
      if (
        actionActive
        && actionPhase
          === "processing"
        && order.phase
          !== "processing"
      ) {
        queueMicrotask(
          () => {
            setActionActive(
              false,
            );
          },
        );
      }
    },
    [
      actionActive,
      actionPhase,
      order.phase,
    ],
  );

  const setAmount =
    useCallback(
      (
        value:
          string,
      ) => {
        setAmountState(
          value,
        );
        setActionError(
          null,
        );
        setActionStatus(
          null,
        );
        setActionPhase(
          "setup",
        );
        setActionActive(
          true,
        );
        order.resetOrder();
      },
      [
        order,
      ],
    );

  const start =
    useCallback(
      async () => {
        setActionActive(
          true,
        );

        if (
          !fiatEnabled
        ) {
          setActionError(
            "Bank withdrawals are coming soon.",
          );

          return;
        }

        if (
          !api
          || !position
        ) {
          setActionError(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        const parsed =
          parseUsdcDepositAmount(
            amount,
          );

        if (
          "error" in parsed
          || parsed.assets
            <= 0n
        ) {
          setActionError(
            "Enter a valid amount.",
          );

          return;
        }

        const available =
          position.usdcBalance
          + position.withdrawableAssets;

        if (
          parsed.assets
          > available
        ) {
          setActionError(
            "Enter an amount no greater than your available balance.",
          );

          return;
        }

        const moonPayWindow =
          window.open(
            "about:blank",
            "_blank",
          );

        if (
          !moonPayWindow
        ) {
          setActionError(
            "Your browser blocked the MoonPay window. Allow popups and try again.",
          );

          return;
        }

        moonPayWindow.opener =
          null;

        setSubmitting(
          true,
        );

        setActionError(
          null,
        );

        setActionStatus(
          "Preparing secure bank withdrawal setup…",
        );

        try {
          const result =
            await api.createMoonPayOfframpUrl(
              amount,
            );

          order.beginMoonPayOrder(
            result.orderId,
          );

          setActionActive(
            false,
          );

          moonPayWindow.location
            .replace(
              result.url,
            );
        } catch (
          startError
        ) {
          moonPayWindow.close();

          diagnostics.error(
            "withdrawal.moonpay_prepare_failed",
            startError,
          );

          setActionStatus(
            null,
          );

          setActionPhase(
            "setup",
          );

          setActionError(
            consumerErrorMessage(
              startError,
              "We couldn't prepare your bank withdrawal. Try again.",
            ),
          );
        } finally {
          setSubmitting(
            false,
          );
        }
      },
      [
        amount,
        api,
        fiatEnabled,
        order,
        position,
      ],
    );

  const refresh =
    useCallback(
      async () => {
        if (
          !order.orderId
        ) {
          return;
        }

        setActionActive(
          false,
        );

        await order.refreshOrder(
          order.orderId,
        );
      },
      [
        order,
      ],
    );

  const confirm =
    useCallback(
      async () => {
        setActionActive(
          true,
        );

        if (
          !fiatEnabled
        ) {
          setActionError(
            "Bank withdrawals are coming soon.",
          );

          setActionPhase(
            "setup",
          );

          return;
        }

        if (
          !api
          || !order.orderId
        ) {
          setActionError(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        setSubmitting(
          true,
        );

        setActionError(
          null,
        );

        setActionStatus(
          "Checking your withdrawal details…",
        );

        setActionPhase(
          "sending",
        );

        let savingsWithdrawn =
          false;

        try {
          const currentOrder =
            await api.getMoonPayOfframpOrder(
              order.orderId,
            );

          if (
            currentOrder.status
              !== "ready"
            || !currentOrder
              .depositWalletAddress
            || !currentOrder
              .moonPayTransactionId
          ) {
            setActionActive(
              false,
            );

            await order.refreshOrder(
              currentOrder.id,
            );

            return;
          }

          const depositWalletAddress =
            currentOrder
              .depositWalletAddress;

          await deliverBankWithdrawal({
            orderId:
              currentOrder.id,
            store:
              order.transferStore,
            execute:
              async () => {
                if (
                  !config
                  || !waitForTransactionReceipt
                  || !account
                  || !order.destinationAsset
                  || !position
                ) {
                  throw new Error(
                    "Your Kept account is not ready yet.",
                  );
                }

                const destinationAsset =
                  order.destinationAsset;

                const withdrawalAmount =
                  BigInt(
                    currentOrder
                      .amountAtomic,
                  );

                const recipient =
                  getAddress(
                    depositWalletAddress,
                  );

                const availableCash =
                  position.usdcBalance;

                const withdrawableSavings =
                  position.withdrawableAssets;

                const availableToSend =
                  availableCash
                  + withdrawableSavings;

                if (
                  withdrawalAmount
                  > availableToSend
                ) {
                  throw new Error(
                    "There is not enough available balance for this withdrawal.",
                  );
                }

                const requiredFromSavings =
                  withdrawalAmount
                    > availableCash
                    ? withdrawalAmount
                      - availableCash
                    : 0n;

                let executionId:
                  string | null =
                    null;

                const acquired =
                  await transactionCoordinator
                    .run(
                      "withdraw",
                      async () => {
                        if (
                          requiredFromSavings
                          > 0n
                        ) {
                          if (
                            requiredFromSavings
                            > withdrawableSavings
                          ) {
                            throw new Error(
                              "There is not enough available savings for this withdrawal.",
                            );
                          }

                          const withdrawal =
                            buildVaultWithdrawTransaction({
                              vault:
                                config.vault,
                              receiver:
                                account,
                              owner:
                                account,
                              assets:
                                requiredFromSavings,
                              chainId:
                                config.chainId,
                            });

                          setActionStatus(
                            "Preparing your money…",
                          );

                          const savingsWithdrawalResult =
                            await submitVaultWithdrawal({
                              withdrawal,
                              beforeSend:
                                async () =>
                                  ensureTransactionNetwork(),
                              sender,
                              receipts: {
                                waitForTransactionReceipt:
                                  async ({
                                    hash,
                                  }) =>
                                    waitForTransactionReceipt(
                                      hash,
                                    ),
                              },
                            });

                          savingsWithdrawn =
                            true;

                          await api.recordTransaction(
                            {
                              type:
                                "SAVINGS_WITHDRAWAL",
                              amountAtomic:
                                requiredFromSavings
                                  .toString(),
                              asset:
                                "USDC",
                              description:
                                "Moved to available cash for bank withdrawal",
                              chainId:
                                config.chainId
                                  .toString(),
                              transactionHash:
                                savingsWithdrawalResult
                                  .withdrawalHash,
                              externalReference:
                                savingsWithdrawalResult
                                  .withdrawalHash,
                            },
                            savingsWithdrawalResult
                              .withdrawalHash,
                          );
                        }

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
                          setActionStatus(
                            "Sending your withdrawal securely…",
                          );

                          const execution =
                            await executeCryptoWithdrawal({
                              runner,
                              amount:
                                withdrawalAmount,
                              recipient,
                              destinationAsset,
                            });

                          executionId =
                            execution.id;
                        } finally {
                          runner.dispose?.();
                        }
                      },
                    );

                if (
                  !acquired
                ) {
                  throw new Error(
                    "Another transaction is already in progress.",
                  );
                }

                if (
                  !executionId
                ) {
                  throw new Error(
                    "Withdrawal execution did not return a reference.",
                  );
                }

                return {
                  id:
                    executionId,
                };
              },
            acknowledge:
              (
                transferReference,
              ) =>
                api.markMoonPayOfframpFundsSent(
                  currentOrder.id,
                  transferReference,
                ),
          });

          setAmountState(
            "",
          );

          setActionError(
            null,
          );

          setActionActive(
            false,
          );

          await Promise.all([
            refreshPosition(),
            refreshProductData(),
          ]);

          await order.refreshOrder(
            currentOrder.id,
          );
        } catch (
          confirmError
        ) {
          diagnostics.warn(
            "withdrawal.bank_execution_failed",
            confirmError,
          );

          const pendingTransfer =
            order.transferStore
              .load(
                order.orderId,
              );

          if (
            pendingTransfer
          ) {
            setActionStatus(
              "Your transfer was sent. Kept is confirming it now…",
            );

            setActionError(
              "We couldn't confirm the transfer yet. Kept will retry without sending your money again.",
            );

            setActionPhase(
              "processing",
            );

            await order.refreshOrder(
              order.orderId,
            );
          } else {
            setActionStatus(
              null,
            );

            if (
              savingsWithdrawn
            ) {
              setActionError(
                "The bank transfer couldn't be completed. Your money was withdrawn from savings successfully and is now available in Kept.",
              );
            } else {
              setActionError(
                consumerErrorMessage(
                  confirmError,
                  "We could not complete this bank withdrawal. Try again.",
                ),
              );
            }

            setActionPhase(
              "failed",
            );
          }

          if (
            savingsWithdrawn
            || pendingTransfer
          ) {
            await Promise.all([
              refreshPosition(),
              refreshProductData(),
            ]);
          }
        } finally {
          setSubmitting(
            false,
          );
        }
      },
      [
        account,
        api,
        config,
        ensureTransactionNetwork,
        fiatEnabled,
        getProvider,
        order,
        position,
        refreshPosition,
        refreshProductData,
        sender,
        transactionCoordinator,
        waitForTransactionReceipt,
      ],
    );

  return {
    amount,
    submitting,
    status,
    error,
    orderId:
      order.orderId,
    phase,
    reviewAmount:
      order.order
        ? formatUsdc(
            BigInt(
              order.order
                .amountAtomic,
            ),
          )
        : null,
    minimumReceive:
      order.minimumReceive,
    setAmount,
    start,
    refresh,
    confirm,
  };
}
