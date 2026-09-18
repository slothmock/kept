// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApp } from "./DashboardApp.js";
import type { Session } from "./session.js";

vi.mock("./kept-evm-wallet.js", () => ({
  useKeptEvmWallet: () => ({
    isReady: true,
    address: "0x123456789012345678901234567890123456c0de",
  }),
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

describe("USDC savings vault dashboard", () => {
  afterEach(cleanup);

  it("shows the single Monad USDC savings vault without loading goals or commitments", async () => {
    render(
      <MemoryRouter>
        <DashboardApp session={session} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Your USDC savings" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add money" })).toBeTruthy();
    expect(screen.getByText("Aave on Monad")).toBeTruthy();
    expect(screen.getByText("Account ready")).toBeTruthy();
    expect(screen.getByText("0x1234…c0de")).toBeTruthy();
    expect(screen.getByRole("button", { name: "My Account" })).toBeTruthy();
  });

  it("opens account details from the header", async () => {
    render(
      <MemoryRouter>
        <DashboardApp session={session} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "My Account" }));

    expect(screen.getByRole("dialog", { name: "Your local test wallet" })).toBeTruthy();
    expect(screen.getByText("0x123456789012345678901234567890123456c0de")).toBeTruthy();
  });

  it("opens a local-test USDC deposit form for the signed-in account", async () => {
    render(
      <MemoryRouter>
        <DashboardApp session={session} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add money" }));

    expect(screen.getByRole("dialog", { name: "Add test USDC to your savings" })).toBeTruthy();
    expect(screen.getByLabelText("Amount in USDC")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deposit test USDC" })).toBeTruthy();
  });
});
