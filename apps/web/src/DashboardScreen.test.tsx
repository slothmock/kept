// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardScreen } from "./screens/DashboardScreen.js";

const walletAddress = "0x123456789012345678901234567890123456c0de";

function renderReadyDashboard({
  accountOpen = false,
  fundingOpen = false,
}: {
  readonly accountOpen?: boolean;
  readonly fundingOpen?: boolean;
} = {}) {
  const onCloseFunding = vi.fn();
  const onCloseAccount = vi.fn();
  const onSignOut = vi.fn();
  return render(
    <DashboardScreen
      fundingOpen={fundingOpen}
      accountOpen={accountOpen}
      walletAddress={walletAddress}
      positionState={{
        kind: "ready",
        position: {
          usdcBalance: 90_000_000n,
          allowance: 0n,
          shares: 10_000_000_000_000n,
          assets: 10_000_000n,
        },
      }}
      depositAmount=""
      depositStatus={null}
      depositError={null}
      withdrawAmount=""
      withdrawStatus={null}
      withdrawError={null}
      onAddMoney={vi.fn()}
      onCloseFunding={onCloseFunding}
      onCloseAccount={onCloseAccount}
      onSignOut={onSignOut}
      onDepositAmountChange={vi.fn()}
      onSubmitDeposit={vi.fn()}
      onWithdrawAmountChange={vi.fn()}
      onSubmitWithdrawal={vi.fn()}
      onRefreshPosition={vi.fn()}
    />,
  ).rerender;
}

describe("settled vault position", () => {
  afterEach(cleanup);

  it("opens a centered withdrawal dialog from a confirmed vault position", () => {
    renderReadyDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(screen.getByRole("dialog", { name: "Withdraw test USDC" })).toBeTruthy();
    expect(screen.getByLabelText("Amount in USDC")).toBeTruthy();
  });

  it("shows the relevant balance data in the account modal", () => {
    renderReadyDashboard({ accountOpen: true });

    expect(screen.getByRole("dialog", { name: "Your local test wallet" })).toBeTruthy();
    expect(screen.getByText(walletAddress)).toBeTruthy();
    expect(screen.getByText("90.00 USDC")).toBeTruthy();
    expect(screen.getByText("10.00 USDC")).toBeTruthy();
  });

  it("closes the add-money modal when its backdrop is clicked", () => {
    const onCloseFunding = vi.fn();
    render(
      <DashboardScreen
        fundingOpen
        accountOpen={false}
        walletAddress={walletAddress}
        positionState={{ kind: "ready", position: { usdcBalance: 90_000_000n, allowance: 0n, shares: 10_000_000_000_000n, assets: 10_000_000n } }}
        depositAmount="" depositStatus={null} depositError={null}
        withdrawAmount="" withdrawStatus={null} withdrawError={null}
        onAddMoney={vi.fn()} onCloseFunding={onCloseFunding} onCloseAccount={vi.fn()} onSignOut={vi.fn()}
        onDepositAmountChange={vi.fn()} onSubmitDeposit={vi.fn()} onWithdrawAmountChange={vi.fn()} onSubmitWithdrawal={vi.fn()} onRefreshPosition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("add-money-modal-backdrop"));

    expect(onCloseFunding).toHaveBeenCalledOnce();
  });

  it("provides an account sign-out action and no explicit account close button", () => {
    const onSignOut = vi.fn();
    render(
      <DashboardScreen
        fundingOpen={false} accountOpen walletAddress={walletAddress}
        positionState={{ kind: "ready", position: { usdcBalance: 90_000_000n, allowance: 0n, shares: 10_000_000_000_000n, assets: 10_000_000n } }}
        depositAmount="" depositStatus={null} depositError={null}
        withdrawAmount="" withdrawStatus={null} withdrawError={null}
        onAddMoney={vi.fn()} onCloseFunding={vi.fn()} onCloseAccount={vi.fn()} onSignOut={onSignOut}
        onDepositAmountChange={vi.fn()} onSubmitDeposit={vi.fn()} onWithdrawAmountChange={vi.fn()} onSubmitWithdrawal={vi.fn()} onRefreshPosition={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Close account" })).toBeNull();
  });
});
