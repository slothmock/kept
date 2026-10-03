// @vitest-environment jsdom

import {
    act,
    renderHook,
} from "@testing-library/react";
import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    useExternalFundingWallet,
} from "../src/features/funding/use-external-funding-wallet.js";

const state = vi.hoisted(() => ({
    evmWallets: [] as unknown[],
    solanaWallets: [] as unknown[],
    connectWallet: vi.fn(),
}));

vi.mock(
    "@privy-io/react-auth",
    () => ({
        useWallets:
            () => ({
                wallets:
                    state.evmWallets,
            }),

        useConnectWallet:
            () => ({
                connectWallet:
                    state.connectWallet,
            }),
    }),
);

vi.mock(
    "@privy-io/react-auth/solana",
    () => ({
        useWallets:
            () => ({
                wallets:
                    state.solanaWallets,
            }),
    }),
);

const EVM_ADDRESS =
    "0xAbCdEf0000000000000000000000000000000001";

const EVM_ADDRESS_TWO =
    "0xAbCdEf0000000000000000000000000000000002";

const SOLANA_ADDRESS =
    "11111111111111111111111111111111";

const SOLANA_ADDRESS_TWO =
    "So11111111111111111111111111111111111111112";

function evmWallet(
    address: string,
    walletClientType:
        string,
) {
    const provider = {
        request:
            vi.fn(),
    };

    return {
        address,
        walletClientType,
        getEthereumProvider:
            vi.fn()
                .mockResolvedValue(
                    provider,
                ),
        provider,
    };
}

function solanaWallet(
    address: string,
    name: string,
) {
    return {
        address,

        standardWallet: {
            name,

            accounts: [
                {
                    address,
                },
            ],
        },

        signMessage:
            vi.fn(),

        signTransaction:
            vi.fn(),
    };
}

beforeEach(
    () => {
        state.evmWallets =
            [];

        state.solanaWallets =
            [];

        state.connectWallet
            .mockReset()
            .mockResolvedValue(
                undefined,
            );
    },
);

describe(
    "useExternalFundingWallet",
    () => {
        it(
            "falls back to the remaining wallet when the selected wallet disconnects",
            () => {
                const phantom =
                    solanaWallet(
                        SOLANA_ADDRESS,
                        "Phantom",
                    );

                const solflare =
                    solanaWallet(
                        SOLANA_ADDRESS_TWO,
                        "Solflare",
                    );

                state.solanaWallets = [
                    phantom,
                    solflare,
                ];

                const {
                    result,
                    rerender,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                act(
                    () => {
                        result.current.select(
                            phantom.address,
                            "sol",
                        );
                    },
                );

                expect(
                    result.current.address,
                ).toBe(
                    phantom.address,
                );

                state.solanaWallets = [
                    solflare,
                ];

                rerender();

                expect(
                    result.current.connected,
                ).toBe(
                    true,
                );

                expect(
                    result.current.address,
                ).toBe(
                    solflare.address,
                );

                expect(
                    result.current.family,
                ).toBe(
                    "sol",
                );
            },
        );

        it(
            "leaves selection empty when a stale selection disappears and multiple wallets remain",
            () => {
                const first =
                    solanaWallet(
                        SOLANA_ADDRESS,
                        "Phantom",
                    );

                const second =
                    solanaWallet(
                        SOLANA_ADDRESS_TWO,
                        "Solflare",
                    );

                const third =
                    evmWallet(
                        EVM_ADDRESS,
                        "metamask",
                    );

                state.solanaWallets = [
                    first,
                    second,
                ];

                state.evmWallets = [
                    third,
                ];

                const {
                    result,
                    rerender,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                act(
                    () => {
                        result.current.select(
                            first.address,
                            "sol",
                        );
                    },
                );

                state.solanaWallets = [
                    second,
                ];

                state.evmWallets = [
                    third,
                    evmWallet(
                        EVM_ADDRESS_TWO,
                        "rabby_wallet",
                    ),
                ];

                rerender();

                expect(
                    result.current.connected,
                ).toBe(
                    false,
                );

                expect(
                    result.current.address,
                ).toBeNull();

                expect(
                    result.current.family,
                ).toBeNull();
            },
        );

        it(
            "selects an EVM wallet regardless of checksum casing",
            () => {
                const wallet =
                    evmWallet(
                        EVM_ADDRESS,
                        "metamask",
                    );

                state.evmWallets = [
                    wallet,
                    evmWallet(
                        EVM_ADDRESS_TWO,
                        "rabby_wallet",
                    ),
                ];

                const {
                    result,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                act(
                    () => {
                        result.current.select(
                            EVM_ADDRESS.toLowerCase(),
                            "evm",
                        );
                    },
                );

                expect(
                    result.current.address,
                ).toBe(
                    EVM_ADDRESS,
                );
            },
        );

        it(
            "keeps Solana wallet selection case-sensitive",
            () => {
                state.solanaWallets = [
                    solanaWallet(
                        SOLANA_ADDRESS_TWO,
                        "Solflare",
                    ),
                    solanaWallet(
                        SOLANA_ADDRESS,
                        "Phantom",
                    ),
                ];

                const {
                    result,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                expect(
                    () => {
                        act(
                            () => {
                                result.current.select(
                                    SOLANA_ADDRESS_TWO
                                        .toLowerCase(),
                                    "sol",
                                );
                            },
                        );
                    },
                ).toThrow(
                    "That wallet is no longer connected.",
                );
            },
        );

        it(
            "excludes Privy embedded EVM and Solana wallets",
            () => {
                state.evmWallets = [
                    evmWallet(
                        EVM_ADDRESS,
                        "privy",
                    ),
                    evmWallet(
                        EVM_ADDRESS_TWO,
                        "metamask",
                    ),
                ];

                state.solanaWallets = [
                    solanaWallet(
                        SOLANA_ADDRESS,
                        "Privy",
                    ),
                    solanaWallet(
                        SOLANA_ADDRESS_TWO,
                        "Solflare",
                    ),
                ];

                const {
                    result,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                expect(
                    result.current
                        .availableWallets
                        .map(
                            (
                                wallet,
                            ) =>
                                wallet.walletName,
                        ),
                ).toEqual([
                    "metamask",
                    "Solflare",
                ]);
            },
        );

        it(
            "returns only the provider for the selected wallet family",
            async () => {
                const evm =
                    evmWallet(
                        EVM_ADDRESS,
                        "metamask",
                    );

                const solana =
                    solanaWallet(
                        SOLANA_ADDRESS,
                        "Phantom",
                    );

                state.evmWallets = [
                    evm,
                ];

                state.solanaWallets = [
                    solana,
                ];

                const {
                    result,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                act(
                    () => {
                        result.current.select(
                            evm.address,
                            "evm",
                        );
                    },
                );

                expect(
                    await result.current
                        .getEvmProvider(),
                ).toBe(
                    evm.provider,
                );

                expect(
                    await result.current
                        .getSolanaProvider(),
                ).toBeNull();

                act(
                    () => {
                        result.current.select(
                            solana.address,
                            "sol",
                        );
                    },
                );

                expect(
                    await result.current
                        .getEvmProvider(),
                ).toBeNull();

                const provider =
                    await result.current
                        .getSolanaProvider();

                expect(
                    provider?.publicKey
                        .toBase58(),
                ).toBe(
                    solana.address,
                );
            },
        );

        it(
            "propagates connection rejection",
            async () => {
                const failure =
                    new Error(
                        "Connection rejected",
                    );

                state.connectWallet
                    .mockRejectedValueOnce(
                        failure,
                    );

                const {
                    result,
                } =
                    renderHook(
                        () =>
                            useExternalFundingWallet(),
                    );

                await expect(
                    result.current.connect(
                        "sol",
                    ),
                ).rejects.toBe(
                    failure,
                );

                expect(
                    state.connectWallet,
                ).toHaveBeenCalledWith({
                    walletChainType:
                        "solana-only",

                    walletList: [
                        "solflare",
                        "phantom",
                        "backpack",
                        "jupiter",
                        "detected_solana_wallets",
                        "wallet_connect_qr_solana",
                    ],
                });
            },
        );
    },
);
