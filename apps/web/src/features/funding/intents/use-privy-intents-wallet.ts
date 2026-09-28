import {
    useEffect,
    useState,
} from "react";

import type {
    EthereumProvider,
    KeptEvmWallet,
} from "@/chain/evm-wallet";

import {
    createPrivyIntentsWallet,
} from "./privy-intents-wallet";

type IntentsWallet =
    ReturnType<
        typeof createPrivyIntentsWallet
    >;

interface PrivyIntentsState {
    readonly wallet:
    IntentsWallet | null;

    readonly provider:
    EthereumProvider | null;
}

export function usePrivyIntentsWallet(
    keptWallet: KeptEvmWallet,
): PrivyIntentsState {
    const [
        state,
        setState,
    ] = useState<PrivyIntentsState>({
        wallet: null,
        provider: null,
    });

    useEffect(() => {
        let active = true;

        void keptWallet
            .getProvider()
            .then((provider) => {
                if (
                    !active ||
                    !provider ||
                    !keptWallet.address
                ) {
                    return;
                }

                setState({
                    provider,
                    wallet:
                        createPrivyIntentsWallet({
                            wallet: keptWallet,
                            provider,
                        }),
                });
            });

        return () => {
            active = false;
        };
    }, [
        keptWallet,
        keptWallet.address,
    ]);

    return state;
}