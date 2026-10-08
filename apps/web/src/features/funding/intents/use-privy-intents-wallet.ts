import {
    useEffect,
    useState,
} from "react";

import type {
    EthereumProvider,
    KeptEvmWallet,
} from "@/wallet/evm-wallet";

import {
    createIntentsEvmWallet,
} from "./privy-intents-wallet";

type IntentsWallet =
    ReturnType<
        typeof createIntentsEvmWallet
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
                        createIntentsEvmWallet({
                            address: keptWallet.address,
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