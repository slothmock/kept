// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApp } from "../../src/DashboardApp.js";
import type { Session } from "../../src/auth/session.js";

vi.mock("../../src/chain/evm-wallet.js", () => ({
  useKeptEvmWallet: () => ({ isReady: true, address: null }),
}));

vi.mock("../../src/chain/transaction-sender.js", () => ({
  useKeptTransactionSender: () => ({ sendTransaction: vi.fn() }),
}));

vi.mock("../../src/api/kept-api.js", () => ({
  readApiBaseUrl: () => "http://127.0.0.1:3000",
  createKeptApi: () => ({
    listGoals: async () => [],
    listCommitments: async () => [],
    createGoal: vi.fn(),
    createCommitment: vi.fn(),
    activateCommitment: vi.fn(),
    cancelCommitment: vi.fn(),
  }),
}));

const session: Session = {
  isReady: true,
  isAuthenticated: true,
  getAccessToken: async () => "access-token",
  login: () => undefined,
  logout: () => undefined,
};

describe("Kept funding flow", () => {
  afterEach(cleanup);

  it("keeps the local test deposit control disabled without a configured account", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DashboardApp session={session} />
      </MemoryRouter>,
    );

    const addMoneyButtons = await screen.findAllByRole("button", {
      name: "Add money",
    });

    expect(addMoneyButtons.length).toBeGreaterThan(0);

    await user.click(addMoneyButtons[0]!);

    expect(
      screen.getByRole("heading", {
        name: "Add test USDC to your savings",
      }),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");

    expect(
      within(dialog).getByRole("button", {
        name: "Deposit test USDC",
      }),
    ).toBeDisabled();
  });
});