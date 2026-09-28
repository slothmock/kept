import {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import type {
    EthereumProvider,
    KeptEvmWallet,
} from "@/chain/evm-wallet";

type RunnerOptions =
    Parameters<
        typeof createExecutionRunner
    >[0];

type WalletInput =
    NonNullable<
        RunnerOptions["wallet"]
    >;

type IntentsWallet =
    Exclude<
        WalletInput,
        (...args: never[]) => unknown
    >;

type IntentsProviders =
    ReturnType<
        IntentsWallet["getProviders"]
    >;

type IntentsEvmProvider =
    NonNullable<
        IntentsProviders["evm"]
    >;

export function toIntentsEvmProvider(
    provider: EthereumProvider,
): IntentsEvmProvider {
    return {
        request: (request) =>
            provider.request(
                request as Parameters<
                    EthereumProvider["request"]
                >[0],
            ),
    };
}

interface CreatePrivyIntentsWalletInput {
    readonly wallet: KeptEvmWallet;
    readonly provider: EthereumProvider;
}

export function createPrivyIntentsWallet({
    wallet,
    provider,
}: CreatePrivyIntentsWalletInput): IntentsWallet {
    return {
        id: "privy-embedded-evm",

        name: "Kept",

        chains: [
            "base",
        ],

        signingStandard:
            "erc191",

        connect:
            async () => undefined,

        disconnect:
            async () => undefined,

        getAddress: () =>
            wallet.address ??
            undefined,

        getProviders: () => ({
            evm:
                toIntentsEvmProvider(
                    provider,
                ),
        }),

        getChainId: async () => {
            const rawChainId =
                await provider.request({
                    method: "eth_chainId",
                });

            if (
                typeof rawChainId !== "string"
            ) {
                throw new Error(
                    "Unable to read wallet chain.",
                );
            }

            const chainId =
                Number.parseInt(
                    rawChainId,
                    16,
                );

            if (
                !Number.isSafeInteger(
                    chainId,
                )
            ) {
                throw new Error(
                    "Unable to read wallet chain.",
                );
            }

            return chainId;
        },
    };
}