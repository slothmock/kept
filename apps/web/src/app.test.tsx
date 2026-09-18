// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApp } from "./DashboardApp.js";
import type { Session } from "./session.js";

vi.mock("./kept-evm-wallet.js", () => ({
  useKeptEvmWallet: () => ({ isReady: true, address: null }),
}));

vi.mock("./kept-transaction-sender.js", () => ({
  useKeptTransactionSender: () => ({ sendTransaction: vi.fn() }),
}));

const session: Session = {
  isReady: true,
  isAuthenticated: true,
  getAccessToken: async () => "access-token",
  login: () => undefined,
  logout: () => undefined,
};

describe("Kept savings vault funding flow", () => {
  afterEach(cleanup);

  it("keeps the local test deposit control disabled without a configured account", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <DashboardApp session={session} />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: "Add money" }));

    expect(screen.getByRole("heading", { name: "Add test USDC to your savings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deposit test USDC" }).hasAttribute("disabled")).toBe(true);
  });
});
