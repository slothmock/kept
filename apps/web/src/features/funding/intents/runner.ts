import {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
    evm,
} from "@aurora-is-near/intents-connect-wallet/evm";

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

interface CreateKeptIntentsRunnerInput {
    readonly sourceAddress:
    string;

    readonly provider:
    EthereumProvider;
}

export function createKeptIntentsRunner({
    sourceAddress,
    provider,
}: CreateKeptIntentsRunnerInput) {
    const intentsProvider =
        toIntentsEvmProvider(
            provider,
        );

    const intentsWallet =
        createIntentsEvmWallet({
            address:
                sourceAddress,
            provider,
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