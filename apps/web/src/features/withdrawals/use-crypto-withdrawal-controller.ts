import {
  useCallback,
} from "react";
import {
  encodeFunctionData,
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import {
  PublicKey,
} from "@solana/web3.js";

import type {
  KeptApi,
} from "@/api/kept-api";
import type {
  TransactionSender,
} from "@/wallet/blockchain";
import {
  executeCryptoWithdrawal,
} from "@/features/withdrawals/execute-crypto-withdrawal";
import {
  previewCryptoWithdrawal,
} from "@/features/withdrawals/preview-crypto-withdrawal";
import type {
  EthereumProvider,
} from "@/wallet/evm-wallet";
import {
  createKeptIntentsRunner,
} from "@/features/funding/intents/runner";
import {
  useCryptoWithdrawalUiController,
  type CryptoWithdrawalUiController,
} from "@/features/withdrawals/use-crypto-withdrawal-ui-controller";
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

interface UseCryptoWithdrawalControllerInput {
  readonly api:
    KeptApi | null;

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

export interface CryptoWithdrawalController
  extends
    CryptoWithdrawalUiController {
  readonly preview:
    () => Promise<void>;

  readonly execute:
    () => Promise<void>;
}

export function useCryptoWithdrawalController({
  api,
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
}: UseCryptoWithdrawalControllerInput):
  CryptoWithdrawalController {
  const ui =
    useCryptoWithdrawalUiController();

  const preview =
    useCallback(
      async () => {
        if (
          !account
          || !config
          || !position
        ) {
          ui.failPreview(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        const parsedAmount =
          parseUsdcDepositAmount(
            ui.amount,
          );

        if (
          "error" in
          parsedAmount
        ) {
          ui.failPreview(
            parsedAmount.error,
          );

          return;
        }

        if (
          parsedAmount.assets
            > position.withdrawableAssets
        ) {
          ui.failPreview(
            "Enter an amount no greater than your available savings.",
          );

          return;
        }

        const destinationAsset =
          ui.destinationAssets.find(
            (
              asset,
            ) =>
              asset.assetId
              === ui.destinationAssetId,
          );

        if (
          !destinationAsset
        ) {
          ui.failPreview(
            "Choose a withdrawal network.",
          );

          return;
        }

        ui.startPreview();

        try {
          if (
            destinationAsset.blockchain
            === "monad"
          ) {
            ui.completePreview(
              "Transfer ready.",
            );

            return;
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
            await previewCryptoWithdrawal({
              runner,
              amount:
                parsedAmount.assets,
              recipient:
                ui.recipient,
              destinationAsset,
            });

            ui.completePreview(
              "Transfer route ready.",
            );
          } finally {
            runner.dispose?.();
          }
        } catch (
          error
        ) {
          diagnostics.error(
            "withdrawal.crypto_preview_failed",
            error,
          );

          ui.failPreview(
            consumerErrorMessage(
              error,
              "We could not prepare this transfer. Try again.",
            ),
          );
        }
      },
      [
        account,
        config,
        ensureTransactionNetwork,
        getProvider,
        position,
        ui,
      ],
    );

  const execute =
    useCallback(
      async () => {
        if (
          !config
          || !waitForTransactionReceipt
          || !account
          || !position
        ) {
          ui.failExecution(
            "Your Kept account is not ready yet.",
          );

          return;
        }

        const parsedAmount =
          parseUsdcDepositAmount(
            ui.amount,
          );

        if (
          "error" in
          parsedAmount
        ) {
          ui.failExecution(
            parsedAmount.error,
          );

          return;
        }

        const availableCash =
          position.usdcBalance;

        const withdrawableSavings =
          position.withdrawableAssets;

        const availableToSend =
          availableCash
          + withdrawableSavings;

        if (
          parsedAmount.assets
            > availableToSend
        ) {
          ui.failPreview(
            "Enter an amount no greater than your available balance.",
          );

          return;
        }

        const destinationAsset =
          ui.destinationAssets.find(
            (
              asset,
            ) =>
              asset.assetId
              === ui.destinationAssetId,
          );

        if (
          !destinationAsset
        ) {
          ui.failExecution(
            "Choose a withdrawal network.",
          );

          return;
        }

        if (
          !ui.previewReady
        ) {
          ui.failExecution(
            "Review the transfer before confirming it.",
          );

          return;
        }

        let recipient:
          string;

        if (
          destinationAsset.blockchain
          === "sol"
        ) {
          try {
            recipient =
              new PublicKey(
                ui.recipient,
              ).toBase58();
          } catch {
            ui.failExecution(
              "Enter a valid Solana wallet address.",
            );

            return;
          }
        } else {
          if (
            !isAddress(
              ui.recipient,
            )
          ) {
            ui.failExecution(
              "Enter a valid wallet address.",
            );

            return;
          }

          recipient =
            getAddress(
              ui.recipient,
            );
        }

        const requiredFromSavings =
          parsedAmount.assets
            > availableCash
            ? parsedAmount.assets
              - availableCash
            : 0n;

        ui.startExecution(
          requiredFromSavings
            > 0n
            ? "Preparing your money…"
            : "Preparing transfer…",
        );

        let savingsWithdrawn =
          false;

        try {
          await transactionCoordinator.run(
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
                    "There is not enough available savings for this transfer.",
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

                ui.setExecutionStatus(
                  "Confirm the withdrawal from your savings.",
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

                if (
                  api
                ) {
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
                        "Moved to available cash",
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

                savingsWithdrawn =
                  true;

                ui.setExecutionStatus(
                  "Savings withdrawn. Preparing transfer…",
                );
              }

              if (
                destinationAsset.blockchain
                === "monad"
              ) {
                await ensureTransactionNetwork();

                const hash =
                  await sender
                    .sendTransaction({
                      to:
                        config.usdc,
                      chainId:
                        config.chainId,
                      data:
                        encodeFunctionData({
                          abi:
                            erc20Abi,
                          functionName:
                            "transfer",
                          args: [
                            getAddress(
                              recipient,
                            ),
                            parsedAmount.assets,
                          ],
                        }),
                    });

                ui.setExecutionStatus(
                  "Transfer submitted. Waiting for confirmation…",
                );

                const receipt =
                  await waitForTransactionReceipt(
                    hash,
                  );

                if (
                  receipt.status
                  !== "success"
                ) {
                  throw new Error(
                    "The transfer did not complete successfully.",
                  );
                }

                return;
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
                ui.setExecutionStatus(
                  "Confirm the transfer in your wallet.",
                );

                const execution =
                  await executeCryptoWithdrawal({
                    runner,
                    amount:
                      parsedAmount.assets,
                    recipient,
                    destinationAsset,
                  });

                if (
                  api
                ) {
                  await api.recordTransaction(
                    {
                      type:
                        "CRYPTO_WITHDRAWAL",
                      amountAtomic:
                        parsedAmount.assets
                          .toString(),
                      asset:
                        destinationAsset.symbol,
                      description:
                        "Sent to external wallet",
                      chainId:
                        null,
                      transactionHash:
                        null,
                      externalReference:
                        execution.id,
                    },
                    execution.id,
                  );
                }
              } finally {
                runner.dispose?.();
              }
            },
          );

          ui.completeExecution(
            "Transfer complete.",
          );

          ui.clearAfterExecution();

          await Promise.all([
            refreshPosition(),
            refreshProductData(),
          ]);
        } catch (
          error
        ) {
          diagnostics.warn(
            "withdrawal.crypto_execution_failed",
            error,
          );

          if (
            savingsWithdrawn
          ) {
            ui.failExecution(
              "The transfer couldn't be completed. Your money was withdrawn from savings successfully and is now available in Kept.",
            );

            await Promise.all([
              refreshPosition(),
              refreshProductData(),
            ]);
          } else {
            ui.failExecution(
              consumerErrorMessage(
                error,
                "We could not complete this transfer. Try again.",
              ),
            );
          }
        }
      },
      [
        account,
        api,
        config,
        ensureTransactionNetwork,
        getProvider,
        position,
        refreshPosition,
        refreshProductData,
        sender,
        transactionCoordinator,
        ui,
        waitForTransactionReceipt,
      ],
    );

  return {
    ...ui,
    preview,
    execute,
  };
}
