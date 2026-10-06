import {
  useCallback,
  useState,
} from "react";
import type {
  Address,
  Hex,
} from "viem";

import type {
  KeptApi,
} from "@/api/kept-api";
import type {
  TransactionSender,
} from "@/application/ports/blockchain";
import type {
  DepositQuoteState,
} from "@/features/savings/deposit-quote";
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
  minimumUsdcDepositError,
  parseUsdcDepositAmount,
} from "@/vault/deposit-input";
import {
  submitVaultDeposit,
  submitVaultWithdrawal,
} from "@/vault/executor";
import type {
  VaultPosition,
} from "@/vault/position";
import type {
  VaultTransactionCoordinator,
} from "@/vault/transaction-lock";
import {
  buildVaultDepositTransactions,
  buildVaultWithdrawTransaction,
} from "@/vault/transactions";

interface UseSavingsTransactionsControllerInput {
  readonly api:
    KeptApi | null;

  readonly account:
    Address | null;

  readonly config:
    VaultConfig | null;

  readonly position:
    VaultPosition | null;

  readonly depositQuoteState:
    DepositQuoteState;

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

  readonly refreshPosition:
    () => Promise<void>;

  readonly refreshProductData:
    () => Promise<void>;

  readonly refreshSavingsPerformance:
    () => Promise<void>;

  readonly refreshSavingsMarketStatus:
    () => Promise<void>;
}

export function useSavingsTransactionsController({
  api,
  account,
  config,
  position,
  depositQuoteState,
  sender,
  transactionCoordinator,
  ensureTransactionNetwork,
  waitForTransactionReceipt,
  refreshPosition,
  refreshProductData,
  refreshSavingsPerformance,
  refreshSavingsMarketStatus,
}: UseSavingsTransactionsControllerInput): {
  readonly depositAmount:
    string;

  readonly depositStatus:
    string | null;

  readonly depositError:
    string | null;

  readonly withdrawAmount:
    string;

  readonly withdrawStatus:
    string | null;

  readonly withdrawError:
    string | null;

  readonly setDepositAmount:
    (value: string) => void;

  readonly setWithdrawAmount:
    (value: string) => void;

  readonly submitDeposit:
    () => Promise<boolean>;

  readonly submitWithdrawal:
    () => Promise<boolean>;

  readonly dismissDeposit:
    () => void;

  readonly dismissWithdrawal:
    () => void;
} {
  const [
    depositAmount,
    setDepositAmount,
  ] =
    useState("");

  const [
    depositStatus,
    setDepositStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    depositError,
    setDepositError,
  ] =
    useState<
      string | null
    >(null);

  const [
    withdrawAmount,
    setWithdrawAmount,
  ] =
    useState("");

  const [
    withdrawStatus,
    setWithdrawStatus,
  ] =
    useState<
      string | null
    >(null);

  const [
    withdrawError,
    setWithdrawError,
  ] =
    useState<
      string | null
    >(null);

  const refreshSavingsData =
    useCallback(
      () => {
        void Promise.allSettled([
          refreshPosition(),
          refreshProductData(),
          refreshSavingsPerformance(),
          refreshSavingsMarketStatus(),
        ]);
      },
      [
        refreshPosition,
        refreshProductData,
        refreshSavingsMarketStatus,
        refreshSavingsPerformance,
      ],
    );

  const submitDeposit =
    useCallback(
      async (): Promise<boolean> => {
        if (
          !config
          || !waitForTransactionReceipt
          || !account
          || !position
        ) {
          setDepositError(
            "Your Kept account is not ready yet.",
          );

          return false;
        }

        const parsedAmount =
          parseUsdcDepositAmount(
            depositAmount,
          );

        if (
          "error" in parsedAmount
        ) {
          setDepositError(
            parsedAmount.error,
          );

          return false;
        }

        const minimumError =
          minimumUsdcDepositError(
            parsedAmount.assets,
          );

        if (
          minimumError
        ) {
          setDepositError(
            minimumError,
          );

          return false;
        }

        if (
          depositQuoteState.kind
            !== "ready"
          || depositQuoteState.quote.assets
            !== parsedAmount.assets
        ) {
          setDepositError(
            "Wait for the fee details before adding money.",
          );

          return false;
        }

        if (
          parsedAmount.assets
            > position.usdcBalance
        ) {
          setDepositError(
            "Enter an amount no greater than your available cash.",
          );

          return false;
        }

        const [
          approval,
          deposit,
        ] =
          buildVaultDepositTransactions({
            usdc:
              config.usdc,
            vault:
              config.vault,
            receiver:
              account,
            assets:
              parsedAmount.assets,
            chainId:
              config.chainId,
          });

        let succeeded =
          false;

        const acquired =
          await transactionCoordinator.run(
            "deposit",
            async () => {
              setDepositError(
                null,
              );

              setDepositStatus(
                "Adding money to your savings…",
              );

              try {
                const result =
                  await submitVaultDeposit({
                    allowance:
                      position.allowance,
                    assets:
                      parsedAmount.assets,
                    approval,
                    deposit,
                    beforeSend:
                      async () =>
                        ensureTransactionNetwork(),
                    sender,
                    receipts: {
                      waitForTransactionReceipt:
                        async (
                          {
                            hash,
                          },
                        ) =>
                          waitForTransactionReceipt(
                            hash,
                          ),
                    },
                  });

                setDepositAmount(
                  "",
                );

                if (
                  api
                ) {
                  await api.recordTransaction(
                    {
                      type:
                        "SAVINGS_DEPOSIT",
                      amountAtomic:
                        parsedAmount.assets
                          .toString(),
                      asset:
                        "USDC",
                      description:
                        "Added to savings",
                      chainId:
                        config.chainId
                          .toString(),
                      transactionHash:
                        result.depositHash,
                      externalReference:
                        result.depositHash,
                    },
                    result.depositHash,
                  );
                }

                setDepositStatus(
                  "Money added to your savings.",
                );

                succeeded =
                  true;

                refreshSavingsData();
              } catch (
                error
              ) {
                diagnostics.warn(
                  "vault.deposit_failed",
                  error,
                );

                setDepositStatus(
                  null,
                );

                setDepositError(
                  consumerErrorMessage(
                    error,
                    "We could not add your money. Try again.",
                  ),
                );
              }
            },
          );

        return (
          acquired
          && succeeded
        );
      },
      [
        account,
        api,
        config,
        depositAmount,
        depositQuoteState,
        ensureTransactionNetwork,
        position,
        refreshSavingsData,
        sender,
        transactionCoordinator,
        waitForTransactionReceipt,
      ],
    );

  const submitWithdrawal =
    useCallback(
      async (): Promise<boolean> => {
        if (
          !config
          || !waitForTransactionReceipt
          || !account
          || !position
        ) {
          setWithdrawError(
            "Your Kept account is not ready yet.",
          );

          return false;
        }

        const parsedAmount =
          parseUsdcDepositAmount(
            withdrawAmount,
          );

        if (
          "error" in parsedAmount
        ) {
          setWithdrawError(
            parsedAmount.error,
          );

          return false;
        }

        if (
          parsedAmount.assets
            > position.withdrawableAssets
        ) {
          setWithdrawError(
            "Enter an amount no greater than the amount currently available to withdraw.",
          );

          return false;
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
              parsedAmount.assets,
            chainId:
              config.chainId,
          });

        let succeeded =
          false;

        const acquired =
          await transactionCoordinator.run(
            "withdraw",
            async () => {
              setWithdrawError(
                null,
              );

              setWithdrawStatus(
                "Withdrawing...",
              );

              try {
                const result =
                  await submitVaultWithdrawal({
                    withdrawal,
                    beforeSend:
                      async () =>
                        ensureTransactionNetwork(),
                    sender,
                    receipts: {
                      waitForTransactionReceipt:
                        async (
                          {
                            hash,
                          },
                        ) =>
                          waitForTransactionReceipt(
                            hash,
                          ),
                    },
                  });

                setWithdrawAmount(
                  "",
                );

                if (
                  api
                ) {
                  await api.recordTransaction(
                    {
                      type:
                        "SAVINGS_WITHDRAWAL",
                      amountAtomic:
                        parsedAmount.assets
                          .toString(),
                      asset:
                        "USDC",
                      description:
                        "Moved to available cash",
                      chainId:
                        config.chainId
                          .toString(),
                      transactionHash:
                        result.withdrawalHash,
                      externalReference:
                        result.withdrawalHash,
                    },
                    result.withdrawalHash,
                  );
                }

                setWithdrawStatus(
                  "Withdrawal complete.",
                );

                succeeded =
                  true;

                refreshSavingsData();
              } catch (
                error
              ) {
                diagnostics.warn(
                  "vault.withdrawal_failed",
                  error,
                );

                setWithdrawStatus(
                  null,
                );

                setWithdrawError(
                  consumerErrorMessage(
                    error,
                    "We could not complete your withdrawal. Try again.",
                  ),
                );
              }
            },
          );

        return (
          acquired
          && succeeded
        );
      },
      [
        account,
        api,
        config,
        ensureTransactionNetwork,
        position,
        refreshSavingsData,
        sender,
        transactionCoordinator,
        waitForTransactionReceipt,
        withdrawAmount,
      ],
    );

  const dismissDeposit =
    useCallback(
      () => {
        setDepositAmount(
          "",
        );

        setDepositStatus(
          null,
        );

        setDepositError(
          null,
        );
      },
      [],
    );

  const dismissWithdrawal =
    useCallback(
      () => {
        setWithdrawAmount(
          "",
        );

        setWithdrawStatus(
          null,
        );

        setWithdrawError(
          null,
        );
      },
      [],
    );

  return {
    depositAmount,
    depositStatus,
    depositError,
    withdrawAmount,
    withdrawStatus,
    withdrawError,
    setDepositAmount,
    setWithdrawAmount,
    submitDeposit,
    submitWithdrawal,
    dismissDeposit,
    dismissWithdrawal,
  };
}
