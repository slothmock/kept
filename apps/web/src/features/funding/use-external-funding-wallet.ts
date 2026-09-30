import {
    useCallback,
    useMemo,
    useState,
} from "react";

import {
    useConnectWallet,
    useWallets,
} from "@privy-io/react-auth";

import type {
    EthereumProvider,
} from "@/chain/evm-wallet";

export interface ExternalFundingWalletOption {
    readonly address:
    string;

    readonly walletName:
    string;
}

export interface ExternalFundingWallet {
    readonly connected:
    boolean;

    readonly address:
    string | null;

    readonly walletClientType:
    string | null;

    readonly availableWallets:
    readonly ExternalFundingWalletOption[];

    connect():
        void;

    select(address: string):
        void;

    clearSelection():
        void;

    getEvmProvider():
        Promise<
            EthereumProvider | null
        >;
}

export function useExternalFundingWallet():
    ExternalFundingWallet {
    const {
        wallets,
    } =
        useWallets();

    const {
        connectWallet,
    } =
        useConnectWallet();

    const [
        selectedAddress,
        setSelectedAddress,
    ] =
        useState<
            string | null
        >(null);

    const externalEvmWallets =
        useMemo(
            () =>
                wallets.filter(
                    (
                        wallet,
                    ) =>
                        wallet.walletClientType !==
                        "privy",
                ),
            [
                wallets,
            ],
        );

    const availableWallets =
        useMemo(
            () =>
                externalEvmWallets.map(
                    (
                        wallet,
                    ): ExternalFundingWalletOption => ({
                        address:
                            wallet.address,

                        walletName:
                            wallet.walletClientType,
                    }),
                ),
            [
                externalEvmWallets,
            ],
        );

    const selectedWallet =
        useMemo(
            () => {
                if (
                    !selectedAddress
                ) {
                    return null;
                }

                return (
                    externalEvmWallets.find(
                        (
                            wallet,
                        ) =>
                            wallet.address
                                .toLowerCase() ===
                            selectedAddress
                                .toLowerCase(),
                    ) ??
                    null
                );
            },
            [
                externalEvmWallets,
                selectedAddress,
            ],
        );

    const connect =
        useCallback(
            () => {
                connectWallet({});
            },
            [
                connectWallet,
            ],
        );

    const select =
        useCallback(
            (
                address:
                    string,
            ) => {
                const wallet =
                    externalEvmWallets.find(
                        (
                            candidate,
                        ) =>
                            candidate.address
                                .toLowerCase() ===
                            address
                                .toLowerCase(),
                    );

                if (
                    !wallet
                ) {
                    throw new Error(
                        "That wallet is no longer connected.",
                    );
                }

                setSelectedAddress(
                    wallet.address,
                );
            },
            [
                externalEvmWallets,
            ],
        );

    const clearSelection =
        useCallback(
            () => {
                setSelectedAddress(
                    null,
                );
            },
            [],
        );

    const getEvmProvider =
        useCallback(
            async () => {
                if (
                    !selectedWallet
                ) {
                    return null;
                }

                return (
                    await selectedWallet
                        .getEthereumProvider()
                ) as EthereumProvider;
            },
            [
                selectedWallet,
            ],
        );

    return {
        connected:
            selectedWallet !==
            null,

        address:
            selectedWallet?.address ??
            null,

        walletClientType:
            selectedWallet
                ?.walletClientType ??
            null,

        availableWallets,

        connect,

        select,

        clearSelection,

        getEvmProvider,
    };
}
