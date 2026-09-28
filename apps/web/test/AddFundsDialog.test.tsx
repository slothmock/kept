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
    "../src/features/funding/intents/preview-funding.js",
    () => ({
        previewKeptFunding,
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
            estimatedDuration:
                37,
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
                                amount:
                                    20_000_000n,

                                walletAddress:
                                    "0x1111111111111111111111111111111111111111",
                            }),
                        );
                    },
                );

                expect(
                    screen.getByText(
                        "Your transfer route is ready.",
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
                    screen.getByLabelText(
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