// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardScreen } from "../../src/screens/DashboardScreen.js";

const walletAddress = "0x123456789012345678901234567890123456c0de";

const baseProps = {
  fundingOpen: false,
  accountOpen: false,
  walletAddress,
  positionState: {
    kind: "ready" as const,
    position: {
      usdcBalance: 90_000_000n,
      allowance: 0n,
      shares: 10_000_000_000_000n,
      assets: 10_000_000n,
    },
  },
  productState: { kind: "ready" as const, goals: [], commitments: [] },
  depositAmount: "",
  depositStatus: null,
  depositError: null,
  withdrawAmount: "",
  withdrawStatus: null,
  withdrawError: null,
  creatingGoal: false,
  goalError: null,
  creatingCommitment: false,
  commitmentError: null,
  onAddMoney: vi.fn(),
  onCloseFunding: vi.fn(),
  onCloseAccount: vi.fn(),
  onSignOut: vi.fn(),
  onDepositAmountChange: vi.fn(),
  onSubmitDeposit: vi.fn(),
  onWithdrawAmountChange: vi.fn(),
  onSubmitWithdrawal: vi.fn(),
  onRefreshPosition: vi.fn(),
  onRefreshProductData: vi.fn(),
  onCreateGoal: vi.fn(async () => true),
  onCreateCommitment: vi.fn(async () => true),
};

describe("product-first dashboard", () => {
  afterEach(cleanup);

  it("shows total Kept balance and a first-goal empty state", () => {
    render(<DashboardScreen {...baseProps} />);

    expect(screen.getByRole("heading", { name: "Keep moving towards what matters." })).toBeTruthy();
    expect(screen.getByText("10.00 USDC")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Create your first goal." })).toBeTruthy();
  });

  it("opens withdrawal from the money section", () => {
    render(<DashboardScreen {...baseProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(screen.getByRole("dialog", { name: "Withdraw test USDC" })).toBeTruthy();
  });

  it("opens the account details modal", () => {
    render(<DashboardScreen {...baseProps} accountOpen />);
    expect(screen.getByRole("dialog", { name: "Your local test wallet" })).toBeTruthy();
    expect(screen.getByText(walletAddress)).toBeTruthy();
  });

  it("opens the create-goal flow", () => {
    render(<DashboardScreen {...baseProps} />);
    fireEvent.click(screen.getAllByRole("button", { name: /new goal/i })[0]!);
    expect(screen.getByRole("dialog", { name: "Create a goal" })).toBeTruthy();
  });
});
