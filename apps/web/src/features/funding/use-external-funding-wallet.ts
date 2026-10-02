import {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    useConnectWallet,
    useWallets,
} from "@privy-io/react-auth";

import {
    useSolanaWallets,
} from "@privy-io/react-auth/solana";

import {
    PublicKey,
    Transaction,
    VersionedTransaction,
} from "@solana/web3.js";

import type {
    SolanaProvider,
} from "@aurora-is-near/intents-connect";

import type {
    EthereumProvider,
} from "@/chain/evm-wallet";

export type ExternalWalletFamily =
    | "evm"
    | "sol";

export interface ExternalFundingWalletOption {
    readonly address:
    string;

    readonly walletName:
    string;

    readonly family:
    ExternalWalletFamily;
}

export interface ExternalFundingWallet {
    readonly connected:
    boolean;

    readonly address:
    string | null;

    readonly walletClientType:
    string | null;

    readonly family:
    ExternalWalletFamily | null;

    readonly availableWallets:
    readonly ExternalFundingWalletOption[];

    connect():
        void;

    select(
        address: string,
        family?: ExternalWalletFamily,
    ):
        void;

    clearSelection():
        void;

    getEvmProvider():
        Promise<
            EthereumProvider | null
        >;

    getSolanaProvider():
        Promise<
            SolanaProvider | null
        >;
}

export function useExternalFundingWallet():
    ExternalFundingWallet {
    const {
        wallets: evmWallets,
    } =
        useWallets();

    const {
        wallets: solanaWallets,
    } =
        useSolanaWallets();

    const {
        connectWallet,
    } =
        useConnectWallet();

    const [
        selectedKey,
        setSelectedKey,
    ] =
        useState<
            string | null
        >(null);

    const externalEvmWallets =
        useMemo(
            () =>
                evmWallets.filter(
                    (
                        wallet,
                    ) =>
                        wallet.walletClientType !==
                        "privy",
                ),
            [
                evmWallets,
            ],
        );

    const externalSolanaWallets =
        useMemo(
            () =>
                solanaWallets.filter(
                    (
                        wallet,
                    ) =>
                        wallet.walletClientType !==
                        "privy",
                ),
            [
                solanaWallets,
            ],
        );

    const availableWallets =
        useMemo(
            () => [
                ...externalEvmWallets.map(
                    (
                        wallet,
                    ): ExternalFundingWalletOption => ({
                        address:
                            wallet.address,

                        walletName:
                            wallet.walletClientType,

                        family:
                            "evm",
                    }),
                ),

                ...externalSolanaWallets.map(
                    (
                        wallet,
                    ): ExternalFundingWalletOption => ({
                        address:
                            wallet.address,

                        walletName:
                            wallet.walletClientType,

                        family:
                            "sol",
                    }),
                ),
            ],
            [
                externalEvmWallets,
                externalSolanaWallets,
            ],
        );

    useEffect(
        () => {
            if (
                selectedKey ||
                availableWallets.length !== 1
            ) {
                return;
            }

            const onlyWallet =
                availableWallets[0];

            if (
                onlyWallet
            ) {
                setSelectedKey(
                    `${onlyWallet.family}:${onlyWallet.address}`,
                );
            }
        },
        [
            availableWallets,
            selectedKey,
        ],
    );

    const selectedOption =
        useMemo(
            () =>
                availableWallets.find(
                    (
                        wallet,
                    ) =>
                        `${wallet.family}:${wallet.address}` ===
                        selectedKey,
                ) ??
                null,
            [
                availableWallets,
                selectedKey,
            ],
        );

    const selectedEvmWallet =
        useMemo(
            () =>
                selectedOption?.family ===
                    "evm"
                    ? externalEvmWallets.find(
                        (
                            wallet,
                        ) =>
                            wallet.address.toLowerCase() ===
                            selectedOption.address.toLowerCase(),
                    ) ??
                    null
                    : null,
            [
                externalEvmWallets,
                selectedOption,
            ],
        );

    const selectedSolanaWallet =
        useMemo(
            () =>
                selectedOption?.family ===
                    "sol"
                    ? externalSolanaWallets.find(
                        (
                            wallet,
                        ) =>
                            wallet.address ===
                            selectedOption.address,
                    ) ??
                    null
                    : null,
            [
                externalSolanaWallets,
                selectedOption,
            ],
        );

    const connect =
        useCallback(
            () => {
                void connectWallet({
                    walletChainType:
                        "ethereum-and-solana",
                });
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
                family?:
                    ExternalWalletFamily,
            ) => {
                const candidate =
                    availableWallets.find(
                        (
                            wallet,
                        ) =>
                            wallet.address === address &&
                            (
                                !family ||
                                wallet.family === family
                            ),
                    );

                if (
                    !candidate
                ) {
                    throw new Error(
                        "That wallet is no longer connected.",
                    );
                }

                setSelectedKey(
                    `${candidate.family}:${candidate.address}`,
                );
            },
            [
                availableWallets,
            ],
        );

    const clearSelection =
        useCallback(
            () => {
                setSelectedKey(
                    null,
                );
            },
            [],
        );

    const getEvmProvider =
        useCallback(
            async () => {
                if (
                    !selectedEvmWallet
                ) {
                    return null;
                }

                return (
                    await selectedEvmWallet
                        .getEthereumProvider()
                ) as EthereumProvider;
            },
            [
                selectedEvmWallet,
            ],
        );

    const getSolanaProvider =
        useCallback(
            async (): Promise<
                SolanaProvider | null
            > => {
                if (
                    !selectedSolanaWallet
                ) {
                    return null;
                }

                const account =
                    selectedSolanaWallet
                        .standardWallet
                        .accounts
                        .find(
                            (
                                candidate,
                            ) =>
                                candidate.address ===
                                selectedSolanaWallet.address,
                        );

                return {
                    publicKey:
                        account?.publicKey
                            ? new PublicKey(
                                account.publicKey,
                            )
                            : new PublicKey(
                                selectedSolanaWallet.address,
                            ),

                    signMessage:
                        async (
                            message,
                        ) => {
                            const result =
                                await selectedSolanaWallet
                                    .signMessage({
                                        message,
                                    });

                            return result.signature;
                        },

                    signTransaction:
                        async (
                            transaction,
                        ) => {
                            if (
                                transaction instanceof
                                VersionedTransaction
                            ) {
                                const result =
                                    await selectedSolanaWallet
                                        .signTransaction({
                                            transaction:
                                                transaction.serialize(),
                                        });

                                return VersionedTransaction
                                    .deserialize(
                                        result.signedTransaction,
                                    );
                            }

                            if (
                                transaction instanceof
                                Transaction
                            ) {
                                const result =
                                    await selectedSolanaWallet
                                        .signTransaction({
                                            transaction:
                                                transaction.serialize({
                                                    requireAllSignatures:
                                                        false,

                                                    verifySignatures:
                                                        false,
                                                }),
                                        });

                                return Transaction.from(
                                    result.signedTransaction,
                                );
                            }

                            throw new Error(
                                "Unsupported Solana transaction type.",
                            );
                        },
                };
            },
            [
                selectedSolanaWallet,
            ],
        );

    return {
        connected:
            selectedOption !==
            null,

        address:
            selectedOption?.address ??
            null,

        walletClientType:
            selectedOption
                ?.walletName ??
            null,

        family:
            selectedOption?.family ??
            null,

        availableWallets,

        connect,

        select,

        clearSelection,

        getEvmProvider,

        getSolanaProvider,
    };
}
