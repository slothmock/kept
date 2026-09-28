import {
    createExecutionRunner,
} from "@aurora-is-near/intents-connect";

import {
    evm,
} from "@aurora-is-near/intents-connect-wallet/evm";

import type {
    EthereumProvider,
    KeptEvmWallet,
} from "@/chain/evm-wallet";

import {
    intentsConnectApi,
} from "./aurora-api";

import {
    createPrivyIntentsWallet,
    toIntentsEvmProvider,
} from "./privy-intents-wallet";

interface CreateKeptIntentsRunnerInput {
    readonly wallet: KeptEvmWallet;
    readonly provider: EthereumProvider;
}

export function createKeptIntentsRunner({
    wallet,
    provider,
}: CreateKeptIntentsRunnerInput) {
    const intentsProvider =
        toIntentsEvmProvider(
            provider,
        );

    const intentsWallet =
        createPrivyIntentsWallet({
            wallet,
            provider,
        });

    return createExecutionRunner({
        api: intentsConnectApi,
        wallet: intentsWallet,
        plugins: {
            evm,
        },
        pluginOptions: {
            provider:
                intentsProvider,
        },
    });
}