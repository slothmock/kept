// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardApp } from "../../src/DashboardApp.js";
import type { Session } from "../../src/auth/session.js";

vi.mock("../../src/chain/evm-wallet.js", () => ({
  useKeptEvmWallet: () => ({ isReady: true, address: "0x123456789012345678901234567890123456c0de" }),
}));
vi.mock("../../src/chain/transaction-sender.js", () => ({ useKeptTransactionSender: () => ({ sendTransaction: vi.fn() }) }));
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

describe("Kept dashboard", () => {
  afterEach(cleanup);

  it("presents goals and commitments rather than a vault product", async () => {
    render(<MemoryRouter><DashboardApp session={session} /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Keep moving towards what matters." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "What you’re working towards" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your commitments" })).toBeTruthy();
    expect(screen.queryByText("Aave on Monad")).toBeNull();
  });

  it("opens account details from the header", async () => {
    render(<MemoryRouter><DashboardApp session={session} /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "My Account" }));
    expect(screen.getByRole("dialog", { name: "Your local test wallet" })).toBeTruthy();
  });

  it("opens the existing deposit flow", async () => {
    render(<MemoryRouter><DashboardApp session={session} /></MemoryRouter>);
    fireEvent.click((await screen.findAllByRole("button", { name: "Add money" }))[0]!);
    expect(screen.getByRole("dialog", { name: "Add test USDC to your savings" })).toBeTruthy();
  });
});
