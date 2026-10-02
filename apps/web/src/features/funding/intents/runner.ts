import {
    createExecutionRunner,
    type SolanaProvider,
} from "@aurora-is-near/intents-connect";

import {
    evm,
} from "@aurora-is-near/intents-connect-wallet/evm";

import {
    sol,
} from "@aurora-is-near/intents-connect-wallet/solana";

import type {
    EthereumProvider,
} from "@/chain/evm-wallet";

import {
    intentsConnectApi,
} from "./aurora-api";

import {
    createIntentsEvmWallet,
    toIntentsEvmProvider,
} from "./privy-intents-wallet";

import {
    SUPPORTED_SOLANA_FUNDING_CHAINS,
} from "./supported-tokens";

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

function createIntentsSolanaWallet(input: {
    readonly address: string;
    readonly provider: SolanaProvider;
}): IntentsWallet {
    return {
        id: "kept-funding-solana",

        name: "Funding wallet",

        chains: [
            ...SUPPORTED_SOLANA_FUNDING_CHAINS,
        ],

        signingStandard:
            "raw_ed25519",

        connect:
            async () => undefined,

        disconnect:
            async () => undefined,

        getAddress:
            () => input.address,

        getPublicKey:
            () => input.address,

        getProviders:
            () => ({
                sol:
                    input.provider,
            }),
    };
}

type CreateKeptIntentsRunnerInput =
    | {
        readonly sourceAddress:
        string;

        readonly family:
        "evm";

        readonly provider:
        EthereumProvider;
    }
    | {
        readonly sourceAddress:
        string;

        readonly family:
        "sol";

        readonly provider:
        SolanaProvider;

        readonly rpcUrl?:
        string;
    };

export function createKeptIntentsRunner(
    input: CreateKeptIntentsRunnerInput,
) {
    if (
        input.family ===
        "sol"
    ) {
        return createExecutionRunner({
            api:
                intentsConnectApi,

            wallet:
                createIntentsSolanaWallet({
                    address:
                        input.sourceAddress,

                    provider:
                        input.provider,
                }),

            plugins: {
                sol,
            },

            pluginOptions: {
                provider:
                    input.provider,

                ...(input.rpcUrl
                    ? {
                        rpcUrl:
                            input.rpcUrl,
                    }
                    : {}),
            },
        });
    }

    const intentsProvider =
        toIntentsEvmProvider(
            input.provider,
        );

    const intentsWallet =
        createIntentsEvmWallet({
            address:
                input.sourceAddress,
            provider:
                input.provider,
        });

    return createExecutionRunner({
        api:
            intentsConnectApi,

        wallet:
            intentsWallet,

        plugins: {
            evm,
        },

        pluginOptions: {
            provider:
                intentsProvider,
        },
    });
}
