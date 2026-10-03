// @vitest-environment jsdom

import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { AddFundsDialog } from "../src/features/funding/AddFundsDialog.js";

const {
    getProvider,
    previewKeptFunding,
    executeKeptFunding,
    dispose,
    providerRequest,
    resolveKeptFundingAssets,
} = vi.hoisted(() => ({
    getProvider:
        vi.fn(),

    previewKeptFunding:
        vi.fn(),

    executeKeptFunding:
        vi.fn(),

    dispose:
        vi.fn(),

    providerRequest:
        vi.fn(),

    resolveKeptFundingAssets:
        vi.fn(),
}));

vi.mock(
    "../src/chain/evm-wallet.js",
    () => ({
        useKeptEvmWallet:
            () => ({
                address:
                    "0x1111111111111111111111111111111111111111",

                isReady:
                    true,

                chainId:
                    143,

                liveChainId:
                    143,

                getCurrentChainId:
                    vi.fn(),

                getProvider,
            }),
    }),
);

vi.mock(
    "../src/features/funding/use-external-funding-wallet.js",
    () => ({
        useExternalFundingWallet:
            () => ({
                address:
                    "0x1111111111111111111111111111111111111111",

                availableWallets: [
                    {
                        address:
                            "0x1111111111111111111111111111111111111111",

                        family:
                            "evm",

                        walletName:
                            "metamask",
                    },
                ],

                clearSelection:
                    vi.fn(),

                connect:
                    vi.fn(),

                connected:
                    true,

                family:
                    "evm",

                getEvmProvider:
                    async () => provider,

                getSolanaWallet:
                    () => null,

                select:
                    vi.fn(),

                walletClientType:
                    "metamask",
            }),
    }),
);

vi.mock(
    "../src/features/funding/intents/preview-funding.js",
    () => ({
        previewKeptFunding,
    }),
);

vi.mock(
    "../src/features/funding/intents/supported-tokens.js",
    () => ({
        resolveKeptFundingAssets,
    }),
);

vi.mock(
    "../src/features/funding/execute-funding.js",
    () => ({
        executeKeptFunding,
    }),
);

vi.mock(
    "../src/features/funding/intents/runner.js",
    () => ({
        createKeptIntentsRunner:
            () => ({
                dispose,
            }),
    }),
);

vi.mock(
    "../src/features/funding/base-usdc.js",
    () => ({
        readBaseUsdcBalance:
            vi.fn(),
    }),
);

vi.mock(
    "../src/features/funding/PrivyFundingButton.js",
    () => ({
        PrivyFundingButton:
            () => (
                <button type="button">
                    Continue
                </button>
            ),
    }),
);

const provider = {
    request:
        providerRequest,
};

function renderDialog() {
    const onOpenChange =
        vi.fn();

    const onUseAvailableCash =
        vi.fn();

    render(
        <AddFundsDialog
            open
            walletAddress="0x1111111111111111111111111111111111111111"
            onOpenChange={
                onOpenChange
            }
            onUseAvailableCash={
                onUseAvailableCash
            }
        />,
    );

    return {
        onOpenChange,
        onUseAvailableCash,
    };
}

beforeEach(() => {
    vi.clearAllMocks();

    getProvider.mockResolvedValue(
        provider,
    );

    providerRequest.mockImplementation(
        async ({
            method,
        }: {
            method: string;
        }) => {
            if (
                method ===
                "eth_chainId"
            ) {
                return "0x8f";
            }

            if (
                method ===
                "wallet_switchEthereumChain"
            ) {
                return null;
            }

            return null;
        },
    );

    previewKeptFunding.mockResolvedValue({
        preview: {
            execution: {
                id:
                    "preview-execution",

                status:
                    "CREATED",

                quote: {
                    amount:
                        "20000000",

                    amountIn:
                        "20000000",

                    amountOut:
                        "19900000",

                    minAmountOut:
                        "19800000",

                    depositAddress:
                        "0x2222222222222222222222222222222222222222",

                    depositMemo:
                        null,
                },

                details: {
                    intermediaryAddress:
                        "0x3333333333333333333333333333333333333333",

                    networkFee:
                        "100000",

                    estimatedTime:
                        "2 minutes",
                },

                steps:
                    [],
            },
        },
    });

    resolveKeptFundingAssets.mockResolvedValue({
        origins: [
            {
                assetId:
                    "nep141:ethereum-usdc",

                blockchain:
                    "eth",

                contractAddress:
                    "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",

                decimals:
                    6,

                kind:
                    "token",

                symbol:
                    "USDC",
            },
            {
                assetId:
                    "nep141:arbitrum-usdc",

                blockchain:
                    "arb",

                contractAddress:
                    "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",

                decimals:
                    6,

                kind:
                    "token",

                symbol:
                    "USDC",
            },
            {
                assetId:
                    "nep141:optimism-usdc",

                blockchain:
                    "op",

                contractAddress:
                    "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",

                decimals:
                    6,

                kind:
                    "token",

                symbol:
                    "USDC",
            },
            {
                assetId:
                    "nep141:base-usdc",

                blockchain:
                    "base",

                contractAddress:
                    "0x833589fCD6EDB6E08f4c7C32D4f71b54bdA02913",

                decimals:
                    6,

                kind:
                    "token",

                symbol:
                    "USDC",
            },
        ],

        destination: {
            assetId:
                "nep141:monad-usdc",

            blockchain:
                "monad",

            contractAddress:
                null,

            decimals:
                6,

            kind:
                "native",

            symbol:
                "USDC",
        },
    });

    executeKeptFunding.mockResolvedValue({
        status:
            "complete",
    });
});

afterEach(() => {
    cleanup();
});

describe(
    "AddFundsDialog",
    () => {
        it(
            "offers Ethereum, Base, Arbitrum, and Optimism external funding networks",
            async () => {
                renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Transfer crypto",
                        },
                    ),
                );

                const network =
                    await screen.findByLabelText(
                        "Network",
                    );

                expect(
                    network.textContent,
                ).toContain(
                    "Ethereum",
                );

                expect(
                    network.textContent,
                ).toContain(
                    "Base",
                );

                expect(
                    network.textContent,
                ).toContain(
                    "Arbitrum",
                );

                expect(
                    network.textContent,
                ).toContain(
                    "Optimism",
                );

                fireEvent.change(
                    network,
                    {
                        target: {
                            value:
                                "arb",
                        },
                    },
                );

                await waitFor(
                    () => {
                        expect(
                            providerRequest,
                        ).toHaveBeenCalledWith(
                            expect.objectContaining({
                                method:
                                    "wallet_switchEthereumChain",

                                params: [
                                    {
                                        chainId:
                                            "0xa4b1",
                                    },
                                ],
                            }),
                        );
                    },
                );

                fireEvent.change(
                    screen.getByLabelText(
                        "Amount",
                    ),
                    {
                        target: {
                            value:
                                "20",
                        },
                    },
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                );

                await waitFor(
                    () => {
                        expect(
                            previewKeptFunding,
                        ).toHaveBeenCalledWith(
                            expect.objectContaining({
                                sourceAsset:
                                    expect.objectContaining({
                                        assetId:
                                            "nep141:arbitrum-usdc",
                                    }),
                            }),
                        );
                    },
                );
            },
        );

        it(
            "previews a Base USDC transfer",
            async () => {
                renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Transfer crypto",
                        },
                    ),
                );

                fireEvent.change(
                    await screen.findByLabelText(
                        "Amount",
                    ),
                    {
                        target: {
                            value:
                                "20",
                        },
                    },
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                );

                await waitFor(
                    () => {
                        expect(
                            previewKeptFunding,
                        ).toHaveBeenCalledWith(
                            expect.objectContaining({
                                amount:
                                    20_000_000n,

                                walletAddress:
                                    "0x1111111111111111111111111111111111111111",

                                sourceAsset:
                                    expect.objectContaining({
                                        assetId:
                                            "nep141:base-usdc",
                                    }),
                            }),
                        );
                    },
                );

                expect(
                    screen.getByRole(
                        "tab",
                        {
                            name:
                                "Transfer",
                        },
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "You're adding",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Confirm transfer",
                        },
                    ),
                ).toBeTruthy();
            },
        );

        it(
            "keeps route mechanics behind the More info tab",
            async () => {
                renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Transfer crypto",
                        },
                    ),
                );

                fireEvent.change(
                    await screen.findByLabelText(
                        "Amount",
                    ),
                    {
                        target: {
                            value:
                                "20",
                        },
                    },
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                );

                await screen.findByRole(
                    "button",
                    {
                        name:
                            "Confirm transfer",
                    },
                );

                expect(
                    screen.getByRole(
                        "tab",
                        {
                            name:
                                "Transfer",
                        },
                    ).getAttribute(
                        "aria-selected",
                    ),
                ).toBe(
                    "true",
                );

                expect(
                    screen.getByText(
                        "You're adding",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "19.8 USDC",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "2 minutes",
                    ),
                ).toBeTruthy();

                expect(
                    screen.queryByText(
                        "Slippage tolerance",
                    ),
                ).toBeNull();

                fireEvent.click(
                    screen.getByRole(
                        "tab",
                        {
                            name:
                                "More info",
                        },
                    ),
                );

                expect(
                    await screen.findByText(
                        "Expected amount",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "19.9 USDC",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "Provider fee",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "0.1 USDC",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "Slippage tolerance",
                    ),
                ).toBeTruthy();

                expect(
                    screen.getByText(
                        "Destination network",
                    ),
                ).toBeTruthy();
            },
        );

        it(
            "invalidates the preview when the amount changes",
            async () => {
                renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Transfer crypto",
                        },
                    ),
                );

                const amountInput =
                    await screen.findByLabelText(
                        "Amount",
                    );

                fireEvent.change(
                    amountInput,
                    {
                        target: {
                            value:
                                "20",
                        },
                    },
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                );

                await waitFor(
                    () => {
                        expect(
                            screen.getByRole(
                                "button",
                                {
                                    name:
                                        "Confirm transfer",
                                },
                            ),
                        ).toBeTruthy();
                    },
                );

                fireEvent.change(
                    amountInput,
                    {
                        target: {
                            value:
                                "25",
                        },
                    },
                );

                expect(
                    screen.queryByRole(
                        "button",
                        {
                            name:
                                "Confirm transfer",
                        },
                    ),
                ).toBeNull();

                expect(
                    screen.queryByText(
                        "Your transfer route is ready.",
                    ),
                ).toBeNull();

                expect(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                ).toBeTruthy();
            },
        );

        it(
            "executes the previewed transfer amount",
            async () => {
                renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Transfer crypto",
                        },
                    ),
                );

                fireEvent.change(
                    await screen.findByLabelText(
                        "Amount",
                    ),
                    {
                        target: {
                            value:
                                "20",
                        },
                    },
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                );

                const confirmButton =
                    await screen.findByRole(
                        "button",
                        {
                            name:
                                "Confirm transfer",
                        },
                    );

                fireEvent.click(
                    confirmButton,
                );

                await waitFor(
                    () => {
                        expect(
                            executeKeptFunding,
                        ).toHaveBeenCalledWith(
                            expect.objectContaining({
                                amount:
                                    20_000_000n,

                                walletAddress:
                                    "0x1111111111111111111111111111111111111111",

                                sourceAsset:
                                    expect.objectContaining({
                                        assetId:
                                            "nep141:base-usdc",
                                    }),
                            }),
                        );
                    },
                );

                expect(
                    screen.getByText(
                        "Your money has been added to Kept.",
                    ),
                ).toBeTruthy();
            },
        );

        it(
            "shows an execution error when the transfer fails",
            async () => {
                executeKeptFunding.mockRejectedValueOnce(
                    new Error(
                        "Transfer failed",
                    ),
                );

                renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Transfer crypto",
                        },
                    ),
                );

                fireEvent.change(
                    await screen.findByLabelText(
                        "Amount",
                    ),
                    {
                        target: {
                            value:
                                "20",
                        },
                    },
                );

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Continue",
                        },
                    ),
                );

                fireEvent.click(
                    await screen.findByRole(
                        "button",
                        {
                            name:
                                "Confirm transfer",
                        },
                    ),
                );

                await waitFor(
                    () => {
                        expect(
                            screen.getByText(
                                "Transfer failed",
                            ),
                        ).toBeTruthy();
                    },
                );
            },
        );

        it(
            "uses available cash",
            () => {
                const {
                    onOpenChange,
                    onUseAvailableCash,
                } =
                    renderDialog();

                fireEvent.click(
                    screen.getByRole(
                        "button",
                        {
                            name:
                                "Deposit available cash",
                        },
                    ),
                );

                expect(
                    onOpenChange,
                ).toHaveBeenCalledWith(
                    false,
                );

                expect(
                    onUseAvailableCash,
                ).toHaveBeenCalledOnce();
            },
        );
    },
);